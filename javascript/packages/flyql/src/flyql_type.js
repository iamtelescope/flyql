import { FlyqlError } from './core/exceptions.js'

/**
 * flyql.Type — the canonical, dialect-agnostic vocabulary for column and
 * value types within flyql.
 *
 * Inclusion criterion: a value belongs in this enum if (a) the validator
 * behaves differently for it, (b) generator dispatch differs across
 * dialects for it, OR (c) it is a forward-looking type with explicit
 * user-confirmed need (currently: Duration).
 *
 * Lowercase string values match the Go and Python implementations
 * verbatim so JSON test fixtures and serialized columns remain
 * language-agnostic.
 */
export const Type = Object.freeze({
    /** Text values. Enables string-only operators (like, ilike, regex, not regex). */
    String: 'string',
    /** Integer numbers. Enables numeric ordering operators; regex rejected. */
    Int: 'int',
    /** Floating-point numbers. Enables numeric ordering operators; regex rejected. */
    Float: 'float',
    /** Boolean values. Equality and truthy only; ordering operators rejected. */
    Bool: 'bool',
    /** Calendar day only (Y/M/D) — no time-of-day component. Comparisons
     *  truncate to day granularity. Absorbs raw DB types `date` / `date32`.
     *  Distinct from DateTime — a Date column receiving a datetime-shaped
     *  value emits a migration warning. */
    Date: 'date',
    /** Instant-in-time (point on the timeline, ms resolution). Comparisons
     *  happen at millisecond granularity (sub-ms precision is truncated).
     *  Accepts temporal function calls and ISO-8601 string literals with
     *  full time + optional timezone. Absorbs `datetime`, `datetime64`,
     *  `timestamp`, `timestamptz`, `year`. Schema `tz` and `unit` metadata
     *  disambiguates naive strings and numeric values. */
    DateTime: 'datetime',
    /** Interval/duration values. Forward-looking — see Tech Decision #14. */
    Duration: 'duration',
    /** Ordered collection of values. Accepts the `has` operator. */
    Array: 'array',
    /** Key→value collection with dynamic keys. Absorbs PG hstore. */
    Map: 'map',
    /** Fixed-shape record. Absorbs ClickHouse Tuple and StarRocks STRUCT. */
    Struct: 'struct',
    /** Semi-structured JSON document. Absorbs CH JSON, PG json/jsonb, SR JSON. */
    JSON: 'json',
    /** Text column whose contents are valid JSON. Operator set mirrors JSON;
     *  generators wrap access with dialect-specific parse functions. */
    JSONString: 'jsonstring',
    /** Documented fallback for types flyql cannot reason about. */
    Unknown: 'unknown',
})

const _VALID_TOKENS = new Set(Object.values(Type))

/**
 * Strictly parse a string into a flyql.Type. Throws FlyqlError on any
 * value that is not one of the 11 valid lowercase tokens. Strict-mode
 * parsing is mandatory: a lenient fallback to Type.Unknown would
 * silently corrupt downstream consumers (validator, generators).
 *
 * See the unify-column-type-system spec, Tech Decision #21.
 */
export function parseFlyQLType(s) {
    if (_VALID_TOKENS.has(s)) return s
    throw new FlyqlError(`unknown flyql type: ${JSON.stringify(s)}`)
}
