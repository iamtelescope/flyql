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
    meta_json JSON
) ENGINE = MergeTree() ORDER BY id;

INSERT INTO flyql_e2e_test VALUES
(1, 'hello',       42,  19.99, true,  '2023-01-01', 200, 'alice',   'prod',    '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}',     '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}'),
(2, 'world',       10,  99.99, false, '2023-06-15', 200, 'bob',     'staging', '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}',      '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}'),
(3, 'hello world', 100, 10.5,  true,  '2024-01-01', 404, 'charlie', 'dev',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}'),
(4, '',            0,   0.0,   false, '2022-12-31', 500, 'alice',   'prod',    '{"region":"ap-south","tier":"premium","location":{"city":"Mumbai","cloud":{"provider":"gcp"}}}',  '{"region":"ap-south","tier":"premium","location":{"city":"Mumbai","cloud":{"provider":"gcp"}}}'),
(5, 'error test',  5,   50.0,  true,  '2023-03-15', 201, 'bob',     'dev',     '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}',      '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}'),
(6, 'hello test',  200, 150.0, true,  '2023-09-01', 300, 'dave',    'staging', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}');
