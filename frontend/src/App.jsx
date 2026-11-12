import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";

const api = axios.create({ baseURL: "/api" });

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [deployments, setDeployments] = useState([]);
  const [logs, setLogs] = useState("");
  const [cluster, setCluster] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [deploymentResult, clusterResult, metricResult] = await Promise.all([
        api.get("/deployments"),
        api.get("/cluster"),
        api.get("/metrics/summary"),
      ]);
      setDeployments(deploymentResult.data);
      setCluster(clusterResult.data);
      setMetrics(metricResult.data);
    } catch (err) {
      console.error("Dashboard refresh failed:", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      setLogs((previous) => `${previous}${event.data}`);
    };
    ws.onerror = () => setLogs((previous) => `${previous}\n[WebSocket connection issue]\n`);

    return () => {
      clearInterval(timer);
      ws.close();
    };
  }, [refresh]);

  const deploy = async () => {
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError("");
    setLogs("Submitting deployment...\n");

    try {
      const response = await api.post("/deploy", { repoUrl: repoUrl.trim() });
      setLogs((previous) => `${previous}Deployment #${response.data.id} queued.\n`);
      setRepoUrl("");
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not start deployment");
    } finally {
      setLoading(false);
    }
  };

  const readyNodes = cluster?.nodes?.filter((node) => node.ready).length ?? 0;
  const totalNodes = cluster?.nodes?.length ?? 0;

  return (
    <main className="app">
      <div className="container">
        <header className="header">
          <h1 className="title">DeployMesh</h1>
          <p className="subtitle">
            Unified deployments, Kubernetes orchestration and live monitoring
          </p>
        </header>

        <section className="input-group">
          <input
            className="input"
            aria-label="GitHub repository URL"
            placeholder="https://github.com/owner/repository"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
          />
          <button className="button" onClick={deploy} disabled={loading}>
            {loading ? "Starting..." : "Deploy"}
          </button>
        </section>
        {error && <p role="alert">{error}</p>}

        <section className="grid">
          <div className="card">
            <div className="card-title">Kubernetes cluster</div>
            <p>Nodes ready: {totalNodes ? `${readyNodes}/${totalNodes}` : "Loading"}</p>
            <p>Pods running: {cluster?.podCounts?.running ?? "—"}</p>
            <p>Total pods: {cluster?.podCounts?.total ?? "—"}</p>
            {cluster?.nodes?.map((node) => (
              <p key={node.name}>
                {node.name}: {node.ready ? "Ready" : "Not Ready"} ({node.version})
              </p>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Prometheus monitoring</div>
            {metrics?.error ? (
              <p>Prometheus unavailable: {metrics.error}</p>
            ) : metrics?.metrics ? (
              <>
                <p>Active scrape targets: {metrics.metrics.targetsUp?.[0]?.value?.[1] ?? "—"}</p>
                <p>
                  Memory available:{" "}
                  {metrics.metrics.memoryAvailable?.[0]?.value?.[1]
                    ? `${(Number(metrics.metrics.memoryAvailable[0].value[1]) / 1024 ** 3).toFixed(2)} GiB`
                    : "—"}
                </p>
                <p>Source: Prometheus</p>
              </>
            ) : (
              <p>Loading monitoring data...</p>
            )}
          </div>
        </section>

        <section className="grid">
          <div className="card">
            <div className="card-title">Deployments</div>
            {deployments.length === 0 && <p>No deployments yet.</p>}
            {deployments.map((deployment) => (
              <div key={deployment.id} className="row">
                <span>#{deployment.id}</span>
                <span>{deployment.repo_url}</span>
                <span className={deployment.status === "success" ? "success" : "failed"}>
                  {deployment.status}
                </span>
                <span>{deployment.app_name || "—"}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Live deployment logs</div>
            <pre className="logs">{logs || "Waiting for deployment logs..."}</pre>
          </div>
        </section>

        <p className="subtitle">
          Services are private ClusterIP endpoints inside the Kubernetes cluster.
        </p>
      </div>
    </main>
  );
}
