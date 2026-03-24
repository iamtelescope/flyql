#!/usr/bin/env bash
set -euo pipefail

MAX_WAIT=60
INTERVAL=5

wait_for_clickhouse() {
    echo "Waiting for ClickHouse..."
    local elapsed=0
    until docker compose exec -T clickhouse clickhouse-client --query "SELECT 1" >/dev/null 2>&1; do
        if [ "$elapsed" -ge "$MAX_WAIT" ]; then
            echo "ERROR: ClickHouse did not become ready within ${MAX_WAIT}s"
            exit 1
        fi
        echo "  ClickHouse not ready, retrying in ${INTERVAL}s... (${elapsed}s elapsed)"
        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))
    done
    echo "ClickHouse is ready."
}

wait_for_postgresql() {
    echo "Waiting for PostgreSQL..."
    local elapsed=0
    until docker compose exec -T postgresql pg_isready -U flyql -d flyql_test >/dev/null 2>&1; do
        if [ "$elapsed" -ge "$MAX_WAIT" ]; then
            echo "ERROR: PostgreSQL did not become ready within ${MAX_WAIT}s"
            exit 1
        fi
        echo "  PostgreSQL not ready, retrying in ${INTERVAL}s... (${elapsed}s elapsed)"
        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))
    done
    echo "PostgreSQL is ready."
}

wait_for_starrocks() {
    echo "Waiting for StarRocks FE..."
    local elapsed=0
    until docker compose exec -T starrocks mysql -h 127.0.0.1 -P 9030 -u root -e "SELECT 1" >/dev/null 2>&1; do
        if [ "$elapsed" -ge "$MAX_WAIT" ]; then
            echo "ERROR: StarRocks FE did not become ready within ${MAX_WAIT}s"
            exit 1
        fi
        echo "  StarRocks FE not ready, retrying in ${INTERVAL}s... (${elapsed}s elapsed)"
        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))
    done
    echo "StarRocks FE is ready, waiting for BE..."
    elapsed=0
    until docker compose exec -T starrocks mysql -h 127.0.0.1 -P 9030 -u root --skip-column-names -e "SHOW BACKENDS" 2>/dev/null | awk -F'\t' '{print $9}' | grep -q true; do
        if [ "$elapsed" -ge "$MAX_WAIT" ]; then
            echo "ERROR: StarRocks BE did not become ready within ${MAX_WAIT}s"
            exit 1
        fi
        echo "  StarRocks BE not ready, retrying in ${INTERVAL}s... (${elapsed}s elapsed)"
        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))
    done
    echo "StarRocks is ready (FE + BE)."
}

wait_for_clickhouse
wait_for_postgresql
wait_for_starrocks
