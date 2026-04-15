CREATE EXTENSION IF NOT EXISTS hstore;

CREATE TABLE flyql_e2e_test (
    id integer,
    message text,
    count integer,
    price real,
    active boolean,
    created_at date,
    status integer,
    name text,
    env text,
    meta_str text,
    meta_json jsonb,
    tags text[],
    metadata hstore,
    "user@host" text,
    nullable_field text,
    "foo.bar" jsonb
);

INSERT INTO flyql_e2e_test VALUES
(1, 'hello',       42,  19.99, true,  '2023-01-01', 200, 'alice',   'prod',    '{"region":"us-east","tier":"premium","location":{"city":"NYC","cloud":{"provider":"aws"}}}', '{"region":"us-east","tier":"premium","dc.region":"us-1","location":{"city":"NYC","cloud":{"provider":"aws"}},"tags":["web","api"],"0":"zero-a"}', ARRAY['web','api'], 'dc=>us-1,tier=>premium', 'alice@web1', 'value1', '{"baz":"qux-1"}'),
(2, 'world',       10,  99.99, false, '2023-06-15', 200, 'bob',     'staging', '{"region":"eu-west","tier":"free","location":{"city":"London","cloud":{"provider":"gcp"}}}', '{"region":"eu-west","tier":"free","dc.region":"eu-1","location":{"city":"London","cloud":{"provider":"gcp"}},"tags":["mobile","api"],"0":"zero-b"}', ARRAY['mobile','api'], 'dc=>eu-1,tier=>free', 'bob@web2', NULL, '{"baz":"qux-2"}'),
(3, 'hello world', 100, 10.5,  true,  '2024-01-01', 404, 'charlie', 'dev',     '{"region":"us-east","tier":"free","location":{"city":"Boston","cloud":{"provider":"aws"}}}', '{"region":"us-east","tier":"free","dc.region":"us-1","location":{"city":"Boston","cloud":{"provider":"aws"}},"tags":["web","mobile"],"0":"zero-a"}', ARRAY['web','mobile'], 'dc=>us-1,tier=>free', 'charlie@web1', 'value3', '{"baz":"qux-3"}'),
(4, '',            0,   0.0,   false, '2022-12-31', 500, 'alice',   'prod',    NULL, NULL, ARRAY['iot'], 'dc=>ap-1,tier=>premium', 'alice@web3', NULL, '{"baz":"qux-4"}'),
(5, 'error test',  5,   50.0,  true,  '2023-03-15', 201, 'bob',     'dev',     '{"region":"us-east","tier":"free","location":{"city":"NYC","cloud":{"provider":"azure"}}}', '{"region":"us-east","tier":"free","dc.region":"us-1","location":{"city":"NYC","cloud":{"provider":"azure"}},"tags":["web"],"0":"zero-b"}', ARRAY['web'], 'dc=>us-1,tier=>free', 'bob@web1', NULL, '{"baz":"qux-5"}'),
(6, 'hello test',  200, 150.0, true,  '2023-09-01', 300, 'dave',    'staging', '{"region":"eu-west","tier":"premium","location":{"city":"Paris","cloud":{"provider":"azure"}}}', '{"region":"eu-west","tier":"premium","dc.region":"eu-1","location":{"city":"Paris","cloud":{"provider":"azure"}},"tags":["api","mobile"],"0":"zero-c"}', ARRAY['api','mobile'], 'dc=>eu-1,tier=>premium', 'dave@web2', 'value6', '{"baz":"qux-6"}');
