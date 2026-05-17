def test_harness_imports_common():
    import common
    assert hasattr(common, "BenchmarkResult")
