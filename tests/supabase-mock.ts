import type { SupabaseClient } from "@supabase/supabase-js";

type FilterOp = "eq" | "is" | "in";
type Filter = { col: string; op: FilterOp; val: unknown };

interface QueryState {
  table: string;
  filters: Filter[];
  selectCols: string;
  countExact: boolean;
  head: boolean;
  orderBy: { column: string; ascending: boolean } | null;
  limitVal: number | null;
  singleMode: boolean;
  isInsert: boolean;
  isUpdate: boolean;
  isDelete: boolean;
  insertData: unknown;
  updateData: unknown;
}

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

/**
 * Lightweight in-memory Supabase client mock for unit tests.
 * Supports the query surface used by the notification/mission services:
 * select (with count+head), eq, is, in, order, limit, single, insert,
 * update, delete.
 */
export function createMockSupabase(initial: TableData = {}): SupabaseClient {
  const db: TableData = {};
  for (const [table, rows] of Object.entries(initial)) {
    db[table] = rows.map((r) => ({ ...r }));
  }
  let idSeq = 0;

  function ensureTable(table: string): Row[] {
    if (!db[table]) db[table] = [];
    return db[table];
  }

  function applyFilters(rows: Row[], filters: Filter[]): Row[] {
    return rows.filter((row) =>
      filters.every((f) => {
        const rv = row[f.col];
        if (f.op === "eq") return rv === f.val;
        if (f.op === "in") {
          return Array.isArray(f.val) && (f.val as unknown[]).includes(rv);
        }
        if (f.op === "is") {
          if (f.val === null) return rv == null;
          if (f.val === false) return rv != null;
          if (f.val === true) return rv === true;
          return rv === f.val;
        }
        return true;
      }),
    );
  }

  function applyOrder(rows: Row[], orderBy: QueryState["orderBy"]): void {
    if (!orderBy) return;
    rows.sort((a, b) => {
      const av = a[orderBy.column];
      const bv = b[orderBy.column];
      const dir = orderBy.ascending ? 1 : -1;
      if (av === bv) return 0;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av < bv ? -1 : 1;
      } else if (typeof av === "string" && typeof bv === "string") {
        cmp = av < bv ? -1 : 1;
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }
      return cmp * dir;
    });
  }

  function project(rows: Row[], cols: string): Row[] {
    if (cols === "*" || cols === "") return rows;
    const keys = cols.split(",").map((c) => {
      const trimmed = c.trim();
      if (trimmed.includes("(")) {
        return trimmed.split("(")[0].trim();
      }
      return trimmed;
    });
    return rows.map((row) => {
      const picked: Row = {};
      for (const k of keys) picked[k] = row[k];
      return picked;
    });
  }

  function execute(state: QueryState): Promise<unknown> {
    const rows = ensureTable(state.table);
    const { filters, selectCols, countExact, head } = state;

    if (countExact && head) {
      const filtered = applyFilters(rows, filters);
      return Promise.resolve({ count: filtered.length, error: null });
    }

    if (state.isInsert) {
      const data = Array.isArray(state.insertData)
        ? state.insertData
        : [state.insertData];
      const inserted: Row[] = data.map((d) => {
        const row: Row = { ...(d as Row) };
        if (!row.id) row.id = `mock-${idSeq++}`;
        if (!row.created_at) row.created_at = new Date().toISOString();
        rows.push(row);
        return row;
      });
      return Promise.resolve({
        data: state.singleMode ? inserted[0] ?? null : inserted,
        error: null,
      });
    }

    if (state.isUpdate) {
      const filtered = applyFilters(rows, filters);
      for (const row of filtered) {
        Object.assign(row, state.updateData);
      }
      return Promise.resolve({
        data: state.singleMode ? filtered[0] ?? null : filtered,
        error: null,
      });
    }

    if (state.isDelete) {
      const filtered = applyFilters(rows, filters);
      for (const row of filtered) {
        const idx = rows.indexOf(row);
        if (idx >= 0) rows.splice(idx, 1);
      }
      return Promise.resolve({ data: filtered, error: null });
    }

    // SELECT
    let result = applyFilters(rows, filters);
    applyOrder(result, state.orderBy);
    if (state.limitVal !== null) result = result.slice(0, state.limitVal);
    result = project(result, selectCols);

    if (state.singleMode) {
      const data = result[0] ?? null;
      return Promise.resolve({
        data,
        error: data ? null : { message: "Not found", code: "PGRST116" },
      });
    }

    return Promise.resolve({ data: result, error: null });
  }

  function createQueryBuilder(table: string) {
    const state: QueryState = {
      table,
      filters: [],
      selectCols: "*",
      countExact: false,
      head: false,
      orderBy: null,
      limitVal: null,
      singleMode: false,
      isInsert: false,
      isUpdate: false,
      isDelete: false,
      insertData: null,
      updateData: null,
    };

    const builder = {
      select: (cols?: string | { count?: string; head?: boolean }, opts?: { count?: string; head?: boolean }) => {
        if (typeof cols === "string") {
          state.selectCols = cols;
        } else if (cols && typeof cols === "object") {
          state.selectCols = "*";
          if (cols.count === "exact") state.countExact = true;
          if (cols.head === true) state.head = true;
        }
        if (opts) {
          if (opts.count === "exact") state.countExact = true;
          if (opts.head === true) state.head = true;
        }
        return builder;
      },
      eq: (col: string, val: unknown) => {
        state.filters.push({ col, op: "eq", val });
        return builder;
      },
      is: (col: string, val: unknown) => {
        state.filters.push({ col, op: "is", val });
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        state.filters.push({ col, op: "in", val: vals });
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column: col, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit: (n: number) => {
        state.limitVal = n;
        return builder;
      },
      single: () => {
        state.singleMode = true;
        return builder;
      },
      insert: (data: unknown) => {
        state.isInsert = true;
        state.insertData = data;
        return builder;
      },
      update: (data: unknown) => {
        state.isUpdate = true;
        state.updateData = data;
        return builder;
      },
      delete: () => {
        state.isDelete = true;
        return builder;
      },
      then: (onFulfilled?: (value: unknown) => unknown) =>
        execute(state).then(onFulfilled),
      catch: (onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve().catch(onRejected),
    };

    return builder;
  }

  return {
    from: (table: string) => createQueryBuilder(table),
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "test-user-id" } }, error: null }),
    },
  } as unknown as SupabaseClient;
}
