SET allow_experimental_json_type = 1;

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
    meta String,
    meta_json JSON,
    tags Array(String),
    metadata Map(String, String),
    `user@host` String,
    nullable_field Nullable(String)
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO flyql_e2e_test VALUES
(1, 'hello',       42,  19.99, true,  '2023-01-01', 200, 'alice',   'prod',    '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}',     '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}', ['web','api'],         {'dc':'us-1','tier':'premium'}, 'alice@web1', 'value1'),
(2, 'world',       10,  99.99, false, '2023-06-15', 200, 'bob',     'staging', '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}',      '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}',  ['mobile','api'],      {'dc':'eu-1','tier':'free'}, 'bob@web2', NULL),
(3, 'hello world', 100, 10.5,  true,  '2024-01-01', 404, 'charlie', 'dev',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}',  ['web','mobile'],      {'dc':'us-1','tier':'free'}, 'charlie@web1', 'value3'),
(4, '',            0,   0.0,   false, '2022-12-31', 500, 'alice',   'prod',    '{"region":"ap-south","tier":"premium","location":{"city":"Mumbai","cloud":{"provider":"gcp"}}}',  '{"region":"ap-south","tier":"premium","location":{"city":"Mumbai","cloud":{"provider":"gcp"}}}', ['iot'],            {'dc':'ap-1','tier':'premium'}, 'alice@web3', NULL),
(5, 'error test',  5,   50.0,  true,  '2023-03-15', 201, 'bob',     'dev',     '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}',      '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}',   ['web'],               {'dc':'us-1','tier':'free'}, 'bob@web1', NULL),
(6, 'hello test',  200, 150.0, true,  '2023-09-01', 300, 'dave',    'staging', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}', ['api','mobile'],   {'dc':'eu-1','tier':'premium'}, 'dave@web2', 'value6');
