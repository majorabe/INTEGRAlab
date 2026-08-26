# INTEGRA Scripts

Central location for all operational scripts used in the INTEGRA project.

## Available Scripts

### `reset.sh`
Resets the development environment by stopping services and clearing ledger data.

**Usage:**
```bash
./scripts/reset.sh              # Interactive mode (requires confirmation)
./scripts/reset.sh --force      # Non-interactive mode (skips confirmation)
./scripts/reset.sh --with-certs # Remove and regenerate certificates too
```

**What it does:**
1. Stops all Docker Compose services (`docker compose down`)
2. Clears ledger data in `./data/` (preserves directory structure)
3. Optionally removes PKI certificates in `./certs/` (requires `--with-certs` flag)

**Flags:**
- `--force`: Skip confirmation prompt
- `--with-certs`: Also remove certificates (will be regenerated on next start)

**Example workflows:**
```bash
# Full reset with certificates regeneration (development testing)
./scripts/reset.sh --force --with-certs

# Keep certificates, clear only ledger data
./scripts/reset.sh --force

# Interactive reset (asks for confirmation)
./scripts/reset.sh
```

**Next step after running:**
```bash
docker compose up --build
```
