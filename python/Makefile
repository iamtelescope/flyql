fmt:
	black .
test:
	black --check . || exit 1 && python3 -m unittest
cleanup:
	find . -name __pycache__ -type d -exec rm -rf {} +
	rm -rf flyql.egg-info/
	rm -rf build/
