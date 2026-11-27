assert paginate(list(range(25)), 1) == list(range(10))
assert paginate(list(range(25)), 3) == [20, 21, 22, 23, 24]
assert paginate(list('abcdefg'), 2, 3) == ['d', 'e', 'f']
assert paginate(list(range(25)), 4) == []
assert paginate(list(range(5)), 0) == []
assert paginate([], 1) == []
assert paginate(list(range(12)), 2) == [10, 11]
assert paginate(list('abcdefg'), 3, 3) == ['g']
assert paginate(list(range(5)), -1) == []
assert paginate(list(range(30)), 3, 10) == list(range(20, 30))
