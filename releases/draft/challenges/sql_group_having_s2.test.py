import sqlite3
from collections import Counter

SETUP = "CREATE TABLE sales (id INTEGER PRIMARY KEY, category TEXT, quantity INTEGER);\nINSERT INTO sales VALUES (1, 'audio', 4);\nINSERT INTO sales VALUES (2, 'audio', 1);\nINSERT INTO sales VALUES (3, 'audio', 4);\nINSERT INTO sales VALUES (4, 'sports', 19);\nINSERT INTO sales VALUES (5, 'kitchen', 18);\nINSERT INTO sales VALUES (6, 'books', 8);\nINSERT INTO sales VALUES (7, 'audio', 18);\nINSERT INTO sales VALUES (8, 'audio', 10);\nINSERT INTO sales VALUES (9, 'garden', 21);\nINSERT INTO sales VALUES (10, 'kitchen', 15);\nINSERT INTO sales VALUES (11, 'kitchen', 16);\nINSERT INTO sales VALUES (12, 'audio', 4);\nINSERT INTO sales VALUES (13, 'garden', 6);\nINSERT INTO sales VALUES (14, 'sports', 4);\nINSERT INTO sales VALUES (15, 'garden', 19);\nINSERT INTO sales VALUES (16, 'sports', 2);"
REFERENCE = "SELECT category, SUM(quantity) AS total FROM sales GROUP BY category HAVING SUM(quantity) >= 41 ORDER BY total DESC;"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert _got == _expected, "rows %r != expected %r" % (_got[:5], _expected[:5])
