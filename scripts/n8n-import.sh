#!/usr/bin/env bash
set -euo pipefail

# Imports the workflow JSON files in ./n8n/workflows into the n8n container DB.
#
# n8n does NOT auto-import on startup (there is no n8n.config.js here). Run
# this once after `docker compose up` (and again after editing any workflow),
# then activate the workflows in the n8n UI.
#
# Usage:
#   ./scripts/n8n-import.sh
docker compose exec n8n n8n import:workflow --separate --input=/workflows
