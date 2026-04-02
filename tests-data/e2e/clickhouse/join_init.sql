CREATE TABLE IF NOT EXISTS flyql_e2e_related (
    test_id Int32,
    category String,
    priority Int32,
    label String
) ENGINE = MergeTree() ORDER BY test_id;

INSERT INTO flyql_e2e_related VALUES
(1, 'web',    1, 'alpha'),
(2, 'mobile', 2, 'beta'),
(3, 'web',    3, 'gamma'),
(4, 'api',    1, 'delta'),
(5, 'mobile', 2, 'alpha');
