"""
Feature extraction module for URL phishing detection.
Extracts 15 numerical features from a URL for ML classification.
"""

import re
import math
from urllib.parse import urlparse, parse_qs


# Protected brands for impersonation detection
PROTECTED_BRANDS = [
    'paypal', 'google', 'microsoft', 'apple', 'amazon',
    'facebook', 'netflix', 'icloud', 'instagram', 'twitter',
    'linkedin', 'dropbox', 'chase', 'wellsfargo', 'bankofamerica',
    'citibank', 'yahoo', 'outlook', 'office365', 'whatsapp',
]


def levenshtein(a: str, b: str) -> int:
    """Fast Levenshtein distance between two strings."""
    if len(a) < len(b):
        return levenshtein(b, a)
    if len(b) == 0:
        return len(a)
    prev_row = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr_row = [i + 1]
        for j, cb in enumerate(b):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (ca != cb)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]


def extract_features(url: str) -> list[float]:
    """
    Extract 15 numerical features from a URL.
    
    Features:
    [0]  url_length              - Total URL length
    [1]  hostname_length         - Length of hostname
    [2]  has_ip_in_host          - 1 if hostname is an IP address
    [3]  at_symbol_count         - Number of @ symbols
    [4]  dash_count              - Number of dashes in URL
    [5]  question_mark_count     - Number of ? symbols
    [6]  equals_count            - Number of = symbols
    [7]  percent_count           - Number of % symbols
    [8]  double_slash_count      - Number of // (excluding protocol)
    [9]  subdomain_depth         - Number of dots in hostname minus TLD
    [10] path_depth              - Number of / in path
    [11] has_https               - 1 if HTTPS, 0 if HTTP
    [12] url_entropy             - Shannon entropy of the URL string
    [13] brand_min_distance      - Min Levenshtein distance to any protected brand
    [14] suspicious_keywords     - Count of phishing keywords (login, secure, verify, etc.)
    """
    features = [0.0] * 15
    
    # Normalize: add scheme if missing
    normalized = url
    if not url.startswith('http://') and not url.startswith('https://'):
        normalized = 'http://' + url
    
    try:
        parsed = urlparse(normalized)
    except Exception:
        features[0] = len(url)
        return features
    
    hostname = parsed.hostname or ''
    path = parsed.path or ''
    
    # [0] URL length
    features[0] = float(len(url))
    
    # [1] Hostname length
    features[1] = float(len(hostname))
    
    # [2] IP address as hostname
    ip_pattern = re.compile(r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$')
    features[2] = 1.0 if ip_pattern.match(hostname) else 0.0
    
    # [3] @ symbol count
    features[3] = float(url.count('@'))
    
    # [4] Dash count
    features[4] = float(url.count('-'))
    
    # [5] Question mark count
    features[5] = float(url.count('?'))
    
    # [6] Equals count
    features[6] = float(url.count('='))
    
    # [7] Percent count
    features[7] = float(url.count('%'))
    
    # [8] Double slash count (excluding the protocol one)
    features[8] = float(max(0, url.count('//') - 1))
    
    # [9] Subdomain depth
    parts = hostname.split('.')
    features[9] = float(max(0, len(parts) - 2))
    
    # [10] Path depth
    features[10] = float(path.count('/'))
    
    # [11] HTTPS present
    features[11] = 1.0 if parsed.scheme == 'https' else 0.0
    
    # [12] Shannon entropy of URL
    features[12] = _shannon_entropy(url)
    
    # [13] Minimum Levenshtein distance to any protected brand
    min_dist = 999.0
    host_parts = re.split(r'[.\-]', hostname.lower())
    for part in host_parts:
        if len(part) < 3:
            continue
        for brand in PROTECTED_BRANDS:
            dist = levenshtein(part, brand)
            if dist < min_dist:
                min_dist = dist
    features[13] = float(min(min_dist, 10))  # Cap at 10
    
    # [14] Suspicious keyword count
    phishing_keywords = [
        'login', 'signin', 'verify', 'secure', 'account', 'update',
        'confirm', 'banking', 'password', 'credential', 'suspend',
        'unusual', 'alert', 'notification', 'limited', 'restore',
        'unlock', 'authenticate', 'wallet', 'billing',
    ]
    full_url_lower = url.lower()
    keyword_count = sum(1 for kw in phishing_keywords if kw in full_url_lower)
    features[14] = float(keyword_count)
    
    return features


def _shannon_entropy(s: str) -> float:
    """Calculate Shannon entropy of a string."""
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    length = len(s)
    entropy = 0.0
    for count in freq.values():
        p = count / length
        if p > 0:
            entropy -= p * math.log2(p)
    return round(entropy, 4)
