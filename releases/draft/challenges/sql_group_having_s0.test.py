import sqlite3
from collections import Counter

SETUP = "CREATE TABLE sales (id INTEGER PRIMARY KEY, category TEXT, quantity INTEGER);\nINSERT INTO sales VALUES (1, 'audio', 23);\nINSERT INTO sales VALUES (2, 'garden', 24);\nINSERT INTO sales VALUES (3, 'toys', 25);\nINSERT INTO sales VALUES (4, 'audio', 19);\nINSERT INTO sales VALUES (5, 'audio', 23);\nINSERT INTO sales VALUES (6, 'toys', 20);\nINSERT INTO sales VALUES (7, 'books', 1);\nINSERT INTO sales VALUES (8, 'toys', 16);\nINSERT INTO sales VALUES (9, 'sports', 19);\nINSERT INTO sales VALUES (10, 'books', 24);\nINSERT INTO sales VALUES (11, 'sports', 15);\nINSERT INTO sales VALUES (12, 'books', 7);\nINSERT INTO sales VALUES (13, 'audio', 3);\nINSERT INTO sales VALUES (14, 'garden', 6);\nINSERT INTO sales VALUES (15, 'audio', 9);\nINSERT INTO sales VALUES (16, 'audio', 18);\nINSERT INTO sales VALUES (17, 'books', 20);\nINSERT INTO sales VALUES (18, 'books', 19);"
REFERENCE = "SELECT category, SUM(quantity) AS total FROM sales GROUP BY category HAVING SUM(quantity) >= 61 ORDER BY total DESC;"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert _got == _expected, "rows %r != expected %r" % (_got[:5], _expected[:5])
