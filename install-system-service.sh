#!/bin/bash
#
# OmniClaw Gateway Service Installer (System Level)
# Requires sudo to install system service
#

set -e

SERVICE_NAME="omniclaw-gateway"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check for sudo
if [ "$EUID" -ne 0 ]; then
    echo "📝 This script requires sudo. Re-running with elevated permissions..."
    exec sudo "$0" "$@"
fi

# Resolve target user (who invoked sudo) and paths
REAL_USER="${SUDO_USER:-$USER}"
if [ "$REAL_USER" = "root" ] || [ -z "$REAL_USER" ]; then
    REAL_USER="$(stat -c '%U' "$SCRIPT_DIR" 2>/dev/null || echo "root")"
fi
REAL_HOME="$(getent passwd "$REAL_USER" 2>/dev/null | cut -d: -f6)"
REAL_HOME="${REAL_HOME:-/home/$REAL_USER}"
OMNI_DIR="$SCRIPT_DIR"

# Find Node.js (prefer nvm v22; fallback to PATH)
NODE_BIN=""
for candidate in \
    "$REAL_HOME/.nvm/versions/node/v22.22.0/bin/node" \
    "$REAL_HOME"/.nvm/versions/node/v22*/bin/node \
    "$REAL_HOME"/.nvm/versions/node/*/bin/node \
    /usr/local/bin/node \
    /usr/bin/node; do
    if [ -x "$candidate" ] 2>/dev/null; then
        NODE_BIN="$candidate"
        break
    fi
done
if [ -z "$NODE_BIN" ]; then
    NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [ -z "$NODE_BIN" ]; then
    echo "❌ Node.js not found. Install Node.js >=22 (e.g. via nvm) and try again."
    exit 1
fi
NODE_DIR="$(dirname "$NODE_BIN")"

echo "======================================"
echo "  OmniClaw Gateway Service Installer"
echo "======================================"
echo ""

# Check if service already exists
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "✅ Service already installed and running"
    
    echo ""
    echo "🚀 Service status:"
    systemctl status "$SERVICE_NAME" --no-pager || true
    
    echo ""
    echo "Commands:"
    echo "  Status: systemctl status $SERVICE_NAME"
    echo "  Logs:   journalctl -u $SERVICE_NAME -f"
    echo "  Stop:   sudo systemctl stop $SERVICE_NAME"
    echo "  Restart: sudo systemctl restart $SERVICE_NAME"
else
    echo "📝 Creating system service file..."
    echo "   User: $REAL_USER, WorkingDir: $OMNI_DIR, Node: $NODE_BIN"

    # Create service file
    cat > /etc/systemd/system/omniclaw-gateway.service << EOF
[Unit]
Description=OmniClaw Gateway Service
After=network.target

[Service]
Type=simple
User=$REAL_USER
WorkingDirectory=$OMNI_DIR
Environment="PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin"
Environment="NVM_DIR=$REAL_HOME/.nvm"
ExecStart=$NODE_BIN $OMNI_DIR/scripts/run-node.mjs gateway --port 18789
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    echo "✅ Service file created at /etc/systemd/system/omniclaw-gateway.service"
    
    echo ""
    echo "🚀 Reloading systemd and starting service..."
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    systemctl start "$SERVICE_NAME"
    
    sleep 2
    
    echo ""
    echo "======================================"
    echo "  ✅ OmniClaw is now running!"
    echo "======================================"
    echo ""
    echo "Service Status:"
    systemctl status "$SERVICE_NAME" --no-pager || true
    
    echo ""
    echo "Useful commands:"
    echo "  Status:   systemctl status $SERVICE_NAME"
    echo "  Logs:     journalctl -u $SERVICE_NAME -f"
    echo "  Stop:     sudo systemctl stop $SERVICE_NAME"
    echo "  Restart:  sudo systemctl restart $SERVICE_NAME"
    echo ""
    echo "Log file: /tmp/omniclaw/omniclaw-YYYY-MM-DD.log"
fi
