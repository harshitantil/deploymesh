const git = require("simple-git")();
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const log = (message) => console.log(message);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

async function deploy(repoUrl, deploymentId) {
  const id = Number(deploymentId);

  if (!Number.isInteger(id) || id < 1) {
    throw new Error("Invalid deployment ID");
  }

  const parsed = new URL(repoUrl);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Only HTTPS GitHub repository URLs are supported");
  }

  const parts = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Expected a GitHub URL in owner/repository format");
  }

  const appName = `deploymesh-${id}`;
  const imageTag = `docker.io/library/${appName}:latest`;
  const projectPath = path.join(__dirname, "builds", String(id));

  try {
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.rmSync(projectPath, { recursive: true, force: true });

    log(`Deployment #${id}: cloning ${repoUrl}`);
    await git.clone(repoUrl, projectPath);

    const dockerfilePath = path.join(projectPath, "Dockerfile");

    if (!fs.existsSync(dockerfilePath)) {
      const packagePath = path.join(projectPath, "package.json");
      if (!fs.existsSync(packagePath)) {
        throw new Error("Repository needs a Dockerfile or a Node.js package.json");
      }

      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      if (!pkg.scripts || !pkg.scripts.start) {
        throw new Error("Node.js repository must define an npm start script");
      }

      fs.writeFileSync(
        dockerfilePath,
        [
          "FROM node:22-alpine",
          "WORKDIR /app",
          "COPY package*.json ./",
          "RUN npm install --omit=dev",
          "COPY . .",
          "ENV PORT=3000",
          "EXPOSE 3000",
          'CMD ["npm", "start"]',
          "",
        ].join("\n")
      );
    }

    log(`Deployment #${id}: building Docker image ${imageTag}`);
    run("docker", ["build", "-t", imageTag, projectPath], { stdio: "inherit" });

    log("Importing image into the K3s container runtime...");
    execSync(
      `docker image save '${imageTag}' | sudo -n /usr/local/sbin/deploymesh-import-image`,
      { stdio: "inherit", shell: "/bin/bash" }
    );

    const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: default
  labels:
    app: ${appName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
        - name: app
          image: ${imageTag}
          imagePullPolicy: Never
          ports:
            - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: ${appName}
  ports:
    - name: http
      port: 80
      targetPort: 3000
`;

    log("Applying Kubernetes Deployment and Service...");
    execFileSync("kubectl", ["apply", "-f", "-"], {
      input: manifest,
      stdio: ["pipe", "inherit", "inherit"],
    });

    log("Waiting for the Kubernetes rollout...");
    execFileSync(
      "kubectl",
      ["rollout", "status", `deployment/${appName}`, "-n", "default", "--timeout=150s"],
      { stdio: "inherit" }
    );

    log(`KUBERNETES_DEPLOYMENT:${appName}`);
    log(`SERVICE_URL:http://${appName}.default.svc.cluster.local:80`);
    log("Deployment completed successfully.");
  } catch (error) {
    log(`Deployment failed: ${error.message}`);
    if (error.stderr) log(error.stderr.toString());
    process.exitCode = 1;
  } finally {
    // Keep build directory for inspection; each deployment has its own ID.
  }
}

const [repoUrl, deploymentId] = process.argv.slice(2);

if (!repoUrl || !deploymentId) {
  console.error("Usage: node deploy.js <github-repo-url> <deployment-id>");
  process.exit(1);
}

deploy(repoUrl, deploymentId).catch((error) => {
  console.error(error);
  process.exit(1);
});
