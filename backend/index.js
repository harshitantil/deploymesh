const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
const pool = require("./db");
const { spawn, execFileSync } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(message) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function kubectl(args) {
  return execFileSync("kubectl", args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 5 * 1024 * 1024,
  });
}

fastify.register(cors, { origin: true });

fastify.get("/", async () => ({ status: "DeployMesh backend running" }));
fastify.get("/health", async () => ({ status: "ok" }));

fastify.get("/deployments", async () => {
  const result = await pool.query(
    "SELECT * FROM deployments ORDER BY created_at DESC"
  );
  return result.rows;
});

fastify.get("/cluster", async (request, reply) => {
  try {
    const nodes = JSON.parse(kubectl(["get", "nodes", "-o", "json"]));
    const pods = JSON.parse(kubectl(["get", "pods", "-A", "-o", "json"]));

    let usage = [];
    try {
      usage = JSON.parse(kubectl(["top", "nodes", "--no-headers"]))
        .trim().split("\n").filter(Boolean).map((line) => {
          const [name, cpu, cpuPercent, memory, memoryPercent] = line.trim().split(/\s+/);
          return { name, cpu, cpuPercent, memory, memoryPercent };
        });
    } catch {
      usage = [];
    }

    return {
      nodes: nodes.items.map((node) => ({
        name: node.metadata.name,
        ready: node.status.conditions?.find((c) => c.type === "Ready")?.status === "True",
        version: node.status.nodeInfo?.kubeletVersion,
      })),
      podCounts: {
        total: pods.items.length,
        running: pods.items.filter((p) => p.status.phase === "Running").length,
        failed: pods.items.filter((p) => p.status.phase === "Failed").length,
      },
      usage,
    };
  } catch (error) {
    reply.code(500);
    return { error: "Unable to read Kubernetes status", detail: error.message };
  }
});

fastify.get("/metrics/summary", async (request, reply) => {
  try {
    const queries = {
      targetsUp: "count(up == 1)",
      memoryAvailable: "node_memory_MemAvailable_bytes",
      cpuSeconds: "rate(node_cpu_seconds_total{mode!='idle'}[5m])",
    };

    const metrics = {};
    for (const [key, query] of Object.entries(queries)) {
      const apiPath =
        "/api/v1/namespaces/monitoring/services/http:kube-prometheus-stack-prometheus:9090/proxy/api/v1/query?query=" +
        encodeURIComponent(query);
      const data = JSON.parse(kubectl(["get", "--raw", apiPath]));
      metrics[key] = data.data?.result ?? [];
    }

    return { source: "Prometheus", metrics };
  } catch (error) {
    reply.code(503);
    return {
      source: "Prometheus",
      error: "Prometheus query failed",
      detail: error.message,
    };
  }
});

fastify.post("/deploy", async (request, reply) => {
  const repoUrl = request.body?.repoUrl;

  let parsed;
  try {
    parsed = new URL(repoUrl);
  } catch {
    return reply.code(400).send({ error: "Enter a valid GitHub repository URL" });
  }

  const segments = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    segments.length !== 2
  ) {
    return reply.code(400).send({
      error: "Use a public GitHub URL: https://github.com/owner/repository",
    });
  }

  const result = await pool.query(
    "INSERT INTO deployments(repo_url, status, namespace) VALUES($1,$2,$3) RETURNING *",
    [repoUrl, "building", "default"]
  );
  const deployment = result.rows[0];
  const workerPath = path.join(__dirname, "../worker/deploy.js");

  const worker = spawn("node", [workerPath, repoUrl, String(deployment.id)], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, KUBECONFIG: process.env.KUBECONFIG || "/home/ubuntu/.kube/config" },
  });

  let completed = false;
  const finish = async (status) => {
    if (completed) return;
    completed = true;
    try {
      await pool.query(
        "UPDATE deployments SET status=$1, app_name=$2, namespace=$3, service_url=$4 WHERE id=$5",
        [
          status,
          `deploymesh-${deployment.id}`,
          "default",
          `http://deploymesh-${deployment.id}.default.svc.cluster.local`,
          deployment.id,
        ]
      );
    } catch (error) {
      fastify.log.error(error);
    }
    broadcast(`STATUS:${deployment.id}:${status}`);
  };

  worker.stdout.on("data", (data) => {
    const message = data.toString();
    fastify.log.info(message.trim());
    broadcast(message);
  });

  worker.stderr.on("data", (data) => {
    const message = data.toString();
    fastify.log.error(message.trim());
    broadcast(message);
  });

  worker.on("error", async (error) => {
    broadcast(`Worker error: ${error.message}`);
    await finish("failed");
  });

  worker.on("close", async (code) => {
    await finish(code === 0 ? "success" : "failed");
  });

  return reply.code(202).send(deployment);
});

fastify.listen({ host: "127.0.0.1", port: 5000 }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
