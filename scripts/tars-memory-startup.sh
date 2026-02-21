#!/bin/bash
#
# TARS Memory Gateway Hook
# 在 Gateway 启动时自动启动 TARS Memory 服务
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_START_SCRIPT="$SCRIPT_DIR/tars-memory-auto.sh"

# 启动 TARS Memory 服务
$AUTO_START_SCRIPT start

exit 0
