CREATE TABLE flyql_e2e_test (
    id Int32,
    message String,
    count Int64,
    price Float64,
    active Bool,
    created_at Date,
    status Int32,
    name String,
    env String,
    meta_str String,
    meta_json JSON,
    tags Array(String),
    metadata Map(String, String),
    `user@host` String,
    nullable_field Nullable(String),
    `foo.bar` JSON
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO flyql_e2e_test VALUES
(1, 'hello',       42,  19.99, true,  '2023-01-01', 200, 'alice',   'prod',    '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}',     '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}},"obs.test":{"test":"value-1"}}', ['web','api'],         {'dc':'us-1','tier':'premium'}, 'alice@web1', 'value1', '{"baz":"qux-1"}'),
(2, 'world',       10,  99.99, false, '2023-06-15', 200, 'bob',     'staging', '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}',      '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}},"obs.test":{"test":"value-2"}}',  ['mobile','api'],      {'dc':'eu-1','tier':'free'}, 'bob@web2', NULL, '{"baz":"qux-2"}'),
(3, 'hello world', 100, 10.5,  true,  '2024-01-01', 404, 'charlie', 'dev',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}},"obs.test":{"test":"value-3"}}',  ['web','mobile'],      {'dc':'us-1','tier':'free'}, 'charlie@web1', 'value3', '{"baz":"qux-3"}'),
(4, '',            0,   0.0,   false, '2022-12-31', 500, 'alice',   'prod',    NULL,  NULL, ['iot'],            {'dc':'ap-1','tier':'premium'}, 'alice@web3', NULL, '{"baz":"qux-4"}'),
(5, 'error test',  5,   50.0,  true,  '2023-03-15', 201, 'bob',     'dev',     '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}',      '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}},"obs.test":{"test":"value-5"}}',   ['web'],               {'dc':'us-1','tier':'free'}, 'bob@web1', NULL, '{"baz":"qux-5"}'),
(6, 'hello test',  200, 150.0, true,  '2023-09-01', 300, 'dave',    'staging', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}},"obs.test":{"test":"value-6"}}', ['api','mobile'],   {'dc':'eu-1','tier':'premium'}, 'dave@web2', 'value6', '{"baz":"qux-6"}');

-- Dedicated table for cross-language Cyrillic (non-ASCII) e2e cases.
-- Mirrors tests-data/e2e/cyrillic.json. Kept separate from flyql_e2e_test so the
-- shared 6-row dataset and its expected_ids stay untouched.
CREATE TABLE flyql_cyrillic_test (
    id Int32,
    message String,
    name String,
    env String,
    count Int64
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO flyql_cyrillic_test VALUES
(1, 'привет',     'алиса', 'прод', 10),
(2, 'мир',        'борис', 'тест', 20),
(3, 'привет мир', 'алиса', 'прод', 30),
(4, 'hello',      'alice', 'prod', 40),
(5, 'ка''та',     'влад',  'прод', 50);
