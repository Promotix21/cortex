#!/bin/bash
# Cortex Launcher — starts sidecar + desktop app
CORTEX_DIR="/home/rajthecypher/webXExpert-projects/enterprise/apps/cortex"

# Start sidecar if not already running
if ! curl -s http://127.0.0.1:4700/api/projects > /dev/null 2>&1; then
  echo "[cortex] Starting sidecar..."
  cd "$CORTEX_DIR/sidecar"
  nohup npx tsx src/index.ts > /tmp/cortex-sidecar.log 2>&1 &
  SIDECAR_PID=$!
  echo "[cortex] Sidecar PID: $SIDECAR_PID"
  # Wait for sidecar to be ready
  for i in $(seq 1 20); do
    if curl -s http://127.0.0.1:4700/api/projects > /dev/null 2>&1; then
      echo "[cortex] Sidecar ready"
      break
    fi
    sleep 0.5
  done
else
  echo "[cortex] Sidecar already running"
fi

# Launch Cortex desktop app
echo "[cortex] Starting Cortex..."
/usr/bin/cortex "$@"
