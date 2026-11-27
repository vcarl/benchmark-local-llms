import re

POSITIVE = ["PO-RX-80781","PO-SQ-23119","PO-AE-77013","PO-FA-10209","PO-EK-85749","PO-ES-34062","PO-IB-85850","PO-RF-15000","PO-KN-21934","PO-RE-92711","PO-JC-00000","PO-VN-42005-R4","PO-LO-37402-R6","PO-OC-70779-R7","PO-ZB-47902-R2"]
NEGATIVE = ["PO-pz-54051","PO-W-70444","PO-GMW-50981","PO-IS-4948","PO-PM-388758","po-WX-08295","POQX-90232","PO-MR95431","XPO-EF-74378","PO-ZT-69744 ","PO-E1-52008","PO-RU-58782-R0","PO-ZW-91632-R12","PO-AK-32371-r3"]
_p = re.compile(SUBMISSION)
_bad = [s for s in POSITIVE if not _p.fullmatch(s)] + [s for s in NEGATIVE if _p.fullmatch(s)]
assert not _bad, "misclassified %d of %d: %r" % (len(_bad), len(POSITIVE) + len(NEGATIVE), _bad[:5])
