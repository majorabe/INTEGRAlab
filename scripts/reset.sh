#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script variables
FORCE_MODE=false
WITH_CERTS=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      FORCE_MODE=true
      shift
      ;;
    --with-certs)
      WITH_CERTS=true
      shift
      ;;
    *)
      echo -e "${RED}Error: Unknown flag '$1'${NC}"
      echo "Usage: $0 [--force] [--with-certs]"
      exit 1
      ;;
  esac
done

# Validate execution from repo root
if [[ ! -f "$REPO_ROOT/docker-compose.yml" ]]; then
  echo -e "${RED}Error: docker-compose.yml not found in $REPO_ROOT${NC}"
  echo -e "${RED}This script must be run from the INTEGRAlab repository root.${NC}"
  exit 1
fi

cd "$REPO_ROOT"

# Print plan
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}INTEGRA Reset Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}This script will perform the following actions:${NC}"
echo ""
echo "  1. Stop all Docker Compose services (docker compose down)"
echo "  2. Clear ledger data in ./data/ (keep directory structure)"
if [[ "$WITH_CERTS" == false ]]; then
  echo "  3. Keep ./certs/ (certificates will NOT be regenerated)"
else
  echo "  3. Remove ./certs/ (certificates WILL be regenerated on next start)"
fi
echo ""

# Confirmation
if [[ "$FORCE_MODE" == false ]]; then
  echo -e "${YELLOW}To continue, type 'si' and press Enter:${NC}"
  read -p "> " confirmation

  if [[ "$confirmation" != "si" ]]; then
    echo -e "${YELLOW}Reset cancelled by user.${NC}"
    exit 0
  fi
fi

echo ""
echo -e "${BLUE}Starting reset process...${NC}"
echo ""

# Step 1: Docker Compose Down
echo -e "${GREEN}[1/3] Stopping Docker Compose services...${NC}"
if docker compose down 2>&1; then
  echo -e "${GREEN}✓ Services stopped${NC}"
else
  echo -e "${RED}✗ Failed to stop services${NC}"
  exit 1
fi

echo ""

# Step 2: Clear ./data/ content
echo -e "${GREEN}[2/3] Clearing ledger data in ./data/...${NC}"
if [[ -d "$REPO_ROOT/data" ]]; then
  if [[ "$(ls -A "$REPO_ROOT/data" 2>/dev/null || echo "")" ]]; then
    # Try direct removal first (for non-Docker files)
    if rm -rf "$REPO_ROOT/data"/* 2>/dev/null; then
      echo -e "${GREEN}✓ Ledger data cleared${NC}"
    else
      # If direct removal fails, use Docker to clean (handles root-owned files)
      echo -e "${YELLOW}⚠ Using Docker container to clear ledger data (permission issue)${NC}"
      docker run --rm -v "$REPO_ROOT/data:/data" alpine:latest sh -c "rm -rf /data/*" 2>/dev/null && \
        echo -e "${GREEN}✓ Ledger data cleared${NC}" || \
        { echo -e "${RED}✗ Failed to clear ledger data${NC}"; exit 1; }
    fi
  else
    echo -e "${GREEN}✓ ./data/ already empty${NC}"
  fi
else
  echo -e "${YELLOW}⚠ ./data/ directory does not exist (first run?)${NC}"
fi

echo ""

# Step 3: Handle certificates
echo -e "${GREEN}[3/3] Checking certificates...${NC}"
if [[ "$WITH_CERTS" == true ]]; then
  if [[ -d "$REPO_ROOT/certs" ]]; then
    rm -rf "$REPO_ROOT/certs"
    echo -e "${GREEN}✓ Certificates removed (will regenerate on next start)${NC}"
  else
    echo -e "${YELLOW}⚠ ./certs/ directory does not exist${NC}"
  fi
else
  if [[ -d "$REPO_ROOT/certs" ]]; then
    echo -e "${GREEN}✓ Certificates preserved${NC}"
  else
    echo -e "${YELLOW}⚠ ./certs/ directory does not exist (will be generated on next start)${NC}"
  fi
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Reset completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Summary:"
echo "  ✓ Docker Compose services stopped"
echo "  ✓ Ledger data cleared (./data/)"
if [[ "$WITH_CERTS" == true ]]; then
  echo "  ✓ Certificates removed"
else
  echo "  ✓ Certificates preserved"
fi
echo ""
echo -e "${YELLOW}Next step:${NC}"
echo -e "${GREEN}  docker compose up --build${NC}"
echo ""
