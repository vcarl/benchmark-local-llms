result = word_frequency("the cat sat on the mat")
assert result["the"] == 2
assert result["cat"] == 1
assert result["mat"] == 1
result = word_frequency("Hello, hello, HELLO!")
assert result["hello"] == 3
result = word_frequency("")
assert result == {}
