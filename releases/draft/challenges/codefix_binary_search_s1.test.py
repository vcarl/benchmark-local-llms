assert binary_search([1, 3, 5, 7, 9], 7) == 3
assert binary_search([1, 3, 5, 7, 9], 1) == 0
assert binary_search([1, 3, 5, 7, 9], 9) == 4
assert binary_search([1, 3, 5, 7, 9], 4) == -1
assert binary_search([], 3) == -1
assert binary_search([2], 2) == 0
assert binary_search([2, 4], 4) == 1
assert binary_search([2, 4], 1) == -1
assert binary_search(list(range(0, 100, 3)), 51) == 17
assert binary_search(list(range(0, 100, 3)), 52) == -1
assert binary_search([-5, -2, 0, 8], -5) == 0
