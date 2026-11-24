import sqlite3
from collections import Counter

SETUP = "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, amount INTEGER, placed_on TEXT);\nINSERT INTO orders VALUES (101, 'Greta Lind', 'shipped', 479, '2023-07-31');\nINSERT INTO orders VALUES (102, 'Bilal Khan', 'shipped', 35, '2023-06-30');\nINSERT INTO orders VALUES (103, 'Femi Adeyemi', 'pending', 302, '2023-06-29');\nINSERT INTO orders VALUES (104, 'Hugo Martin', 'pending', 74, '2023-07-19');\nINSERT INTO orders VALUES (105, 'Hugo Martin', 'cancelled', 189, '2023-06-07');\nINSERT INTO orders VALUES (106, 'Carmen Ortiz', 'cancelled', 468, '2023-06-05');\nINSERT INTO orders VALUES (107, 'Isla Grant', 'shipped', 351, '2023-07-19');\nINSERT INTO orders VALUES (108, 'Carmen Ortiz', 'shipped', 473, '2023-07-09');\nINSERT INTO orders VALUES (109, 'Hugo Martin', 'pending', 411, '2023-06-12');\nINSERT INTO orders VALUES (110, 'Jun Park', 'shipped', 209, '2023-08-19');\nINSERT INTO orders VALUES (111, 'Carmen Ortiz', 'cancelled', 67, '2023-07-15');\nINSERT INTO orders VALUES (112, 'Femi Adeyemi', 'shipped', 43, '2023-08-07');\nINSERT INTO orders VALUES (113, 'Greta Lind', 'pending', 340, '2023-08-01');\nINSERT INTO orders VALUES (114, 'Elena Petrova', 'shipped', 188, '2023-07-03');\nINSERT INTO orders VALUES (115, 'Jun Park', 'shipped', 446, '2023-06-17');\nINSERT INTO orders VALUES (116, 'Ada Brooks', 'shipped', 437, '2023-07-08');"
REFERENCE = "SELECT COUNT(*), SUM(amount) FROM orders WHERE status = 'shipped' AND placed_on LIKE '2023-07-%';"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert Counter(_got) == Counter(_expected), "rows %r != expected %r (any order)" % (_got[:5], _expected[:5])
