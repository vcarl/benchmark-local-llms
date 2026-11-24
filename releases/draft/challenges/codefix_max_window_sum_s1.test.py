assert max_window_sum([1, 4, 2, 10, 2, 3], 2) == 12
assert max_window_sum([5, -1, 3], 3) == 7
assert max_window_sum([3, 8, 1], 1) == 8
assert max_window_sum([1, 2], 0) is None
assert max_window_sum([1, 2], 3) is None
assert max_window_sum([-4, -2, -7], 2) == -6
assert max_window_sum([9, 1, 1, 1], 2) == 10
assert max_window_sum([1, 1, 1, 9], 2) == 10
assert max_window_sum([7], 1) == 7
assert max_window_sum([], 1) is None
assert max_window_sum([2, -8, 3, 3, -1, 4], 3) == 6
