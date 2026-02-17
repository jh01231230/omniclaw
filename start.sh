#!/usr/bin/env bash
#
# OmniClaw Startup Script
# Run this when Node.js is available
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "  OmniClaw Gateway Launcher"
echo "======================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found!"
    echo ""
    echo "Please install Node.js >=22 first:"
    echo "  - nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
    echo "  - Then: nvm install 22"
    echo ""
    echo "Or install directly from nodejs.org"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Build if needed
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "🔨 Building..."
    pnpm build
fi

echo ""
echo "🚀 Starting OmniClaw Gateway..."
echo ""
echo "🌐 Gateway will be available at: ws://127.0.0.1:18789"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the gateway
pnpm omniclaw gateway --port 18789
