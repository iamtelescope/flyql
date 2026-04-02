USE flyql_test;

CREATE TABLE IF NOT EXISTS flyql_e2e_related (
    test_id INT,
    category STRING,
    priority INT,
    label STRING
) ENGINE = OLAP
DUPLICATE KEY(test_id)
DISTRIBUTED BY HASH(test_id) BUCKETS 1
PROPERTIES ("replication_num" = "1");

INSERT INTO flyql_e2e_related VALUES
(1, 'web',    1, 'alpha'),
(2, 'mobile', 2, 'beta'),
(3, 'web',    3, 'gamma'),
(4, 'api',    1, 'delta'),
(5, 'mobile', 2, 'alpha');
