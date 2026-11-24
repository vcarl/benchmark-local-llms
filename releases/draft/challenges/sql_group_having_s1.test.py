import sqlite3
from collections import Counter

SETUP = "CREATE TABLE sales (id INTEGER PRIMARY KEY, category TEXT, quantity INTEGER);\nINSERT INTO sales VALUES (1, 'toys', 6);\nINSERT INTO sales VALUES (2, 'books', 25);\nINSERT INTO sales VALUES (3, 'toys', 25);\nINSERT INTO sales VALUES (4, 'garden', 9);\nINSERT INTO sales VALUES (5, 'sports', 7);\nINSERT INTO sales VALUES (6, 'sports', 23);\nINSERT INTO sales VALUES (7, 'garden', 9);\nINSERT INTO sales VALUES (8, 'garden', 13);\nINSERT INTO sales VALUES (9, 'books', 3);\nINSERT INTO sales VALUES (10, 'books', 22);\nINSERT INTO sales VALUES (11, 'sports', 23);\nINSERT INTO sales VALUES (12, 'toys', 22);\nINSERT INTO sales VALUES (13, 'sports', 19);\nINSERT INTO sales VALUES (14, 'toys', 16);\nINSERT INTO sales VALUES (15, 'kitchen', 15);\nINSERT INTO sales VALUES (16, 'kitchen', 20);\nINSERT INTO sales VALUES (17, 'garden', 25);"
REFERENCE = "SELECT category, SUM(quantity) AS total FROM sales GROUP BY category HAVING SUM(quantity) >= 56 ORDER BY total DESC;"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert _got == _expected, "rows %r != expected %r" % (_got[:5], _expected[:5])
