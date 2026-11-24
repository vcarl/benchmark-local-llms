import sqlite3
from collections import Counter

SETUP = "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, amount INTEGER, placed_on TEXT);\nINSERT INTO orders VALUES (101, 'Elena Petrova', 'shipped', 227, '2025-06-30');\nINSERT INTO orders VALUES (102, 'Jun Park', 'shipped', 75, '2025-06-14');\nINSERT INTO orders VALUES (103, 'Isla Grant', 'cancelled', 163, '2025-05-16');\nINSERT INTO orders VALUES (104, 'Hugo Martin', 'shipped', 320, '2025-05-28');\nINSERT INTO orders VALUES (105, 'Hugo Martin', 'shipped', 113, '2025-06-30');\nINSERT INTO orders VALUES (106, 'Dev Patel', 'shipped', 184, '2025-07-20');\nINSERT INTO orders VALUES (107, 'Ada Brooks', 'shipped', 365, '2025-05-07');\nINSERT INTO orders VALUES (108, 'Greta Lind', 'cancelled', 458, '2025-06-29');\nINSERT INTO orders VALUES (109, 'Jun Park', 'shipped', 38, '2025-05-22');\nINSERT INTO orders VALUES (110, 'Jun Park', 'pending', 267, '2025-06-25');\nINSERT INTO orders VALUES (111, 'Elena Petrova', 'shipped', 307, '2025-06-29');\nINSERT INTO orders VALUES (112, 'Carmen Ortiz', 'cancelled', 221, '2025-06-09');\nINSERT INTO orders VALUES (113, 'Ada Brooks', 'cancelled', 159, '2025-06-16');\nINSERT INTO orders VALUES (114, 'Bilal Khan', 'shipped', 232, '2025-05-26');"
REFERENCE = "SELECT COUNT(*), SUM(amount) FROM orders WHERE status = 'shipped' AND placed_on LIKE '2025-06-%';"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert Counter(_got) == Counter(_expected), "rows %r != expected %r (any order)" % (_got[:5], _expected[:5])
