import sqlite3
from collections import Counter

SETUP = "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), amount INTEGER);\nINSERT INTO customers VALUES (1, 'Ada Brooks', 'Graz');\nINSERT INTO customers VALUES (2, 'Bilal Khan', 'Graz');\nINSERT INTO customers VALUES (3, 'Carmen Ortiz', 'Graz');\nINSERT INTO customers VALUES (4, 'Dev Patel', 'Graz');\nINSERT INTO customers VALUES (5, 'Elena Petrova', 'Ghent');\nINSERT INTO customers VALUES (6, 'Femi Adeyemi', 'Tartu');\nINSERT INTO customers VALUES (7, 'Greta Lind', 'Ghent');\nINSERT INTO customers VALUES (8, 'Hugo Martin', 'Tartu');\nINSERT INTO orders VALUES (1001, 4, 170);\nINSERT INTO orders VALUES (1002, 3, 191);\nINSERT INTO orders VALUES (1003, 7, 52);\nINSERT INTO orders VALUES (1004, 1, 123);\nINSERT INTO orders VALUES (1005, 1, 239);\nINSERT INTO orders VALUES (1006, 3, 205);\nINSERT INTO orders VALUES (1007, 7, 145);\nINSERT INTO orders VALUES (1008, 1, 233);\nINSERT INTO orders VALUES (1009, 2, 273);\nINSERT INTO orders VALUES (1010, 7, 311);\nINSERT INTO orders VALUES (1011, 6, 156);\nINSERT INTO orders VALUES (1012, 3, 234);\nINSERT INTO orders VALUES (1013, 7, 158);\nINSERT INTO orders VALUES (1014, 2, 314);\nINSERT INTO orders VALUES (1015, 1, 235);\nINSERT INTO orders VALUES (1016, 4, 50);"
REFERENCE = "SELECT DISTINCT c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.city = 'Graz' AND o.amount > 170 ORDER BY c.name;"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert _got == _expected, "rows %r != expected %r" % (_got[:5], _expected[:5])
