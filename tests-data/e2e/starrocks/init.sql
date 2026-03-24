CREATE DATABASE IF NOT EXISTS flyql_test;
USE flyql_test;

CREATE TABLE flyql_e2e_test (
    id INT,
    message STRING,
    `count` BIGINT,
    price FLOAT,
    active BOOLEAN,
    created_at DATE,
    status INT,
    name STRING,
    env STRING,
    meta STRING,
    meta_json JSON,
    tags ARRAY<STRING>,
    metadata MAP<STRING, STRING>,
    `user@host` STRING
) ENGINE = OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES ("replication_num" = "1");

INSERT INTO flyql_e2e_test VALUES
(1, 'hello',       42,  19.99, true,  '2023-01-01', 200, 'alice',   'prod',    '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}',     PARSE_JSON('{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}'), ['web','api'],         map{'dc':'us-1','tier':'premium'}, 'alice@web1'),
(2, 'world',       10,  99.99, false, '2023-06-15', 200, 'bob',     'staging', '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}',      PARSE_JSON('{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}'),  ['mobile','api'],      map{'dc':'eu-1','tier':'free'}, 'bob@web2'),
(3, 'hello world', 100, 10.5,  true,  '2024-01-01', 404, 'charlie', 'dev',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}',     PARSE_JSON('{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}'),  ['web','mobile'],      map{'dc':'us-1','tier':'free'}, 'charlie@web1'),
(4, '',            0,   0.0,   false, '2022-12-31', 500, 'alice',   'prod',    '{"region":"ap-south","tier":"premium","location":{"city":"Mumbai","cloud":{"provider":"gcp"}}}',  PARSE_JSON('{"region":"ap-south","tier":"premium","location":{"city":"Mumbai","cloud":{"provider":"gcp"}}}'), ['iot'],            map{'dc':'ap-1','tier':'premium'}, 'alice@web3'),
(5, 'error test',  5,   50.0,  true,  '2023-03-15', 201, 'bob',     'dev',     '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}',      PARSE_JSON('{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}'),   ['web'],               map{'dc':'us-1','tier':'free'}, 'bob@web1'),
(6, 'hello test',  200, 150.0, true,  '2023-09-01', 300, 'dave',    'staging', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}', PARSE_JSON('{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}'), ['api','mobile'],   map{'dc':'eu-1','tier':'premium'}, 'dave@web2');
