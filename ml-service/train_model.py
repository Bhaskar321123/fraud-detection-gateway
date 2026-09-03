"""
Training script for the XGBoost phishing URL classifier.
Generates a curated synthetic dataset and trains the model.

Usage:
    python train_model.py
    
Output:
    model.pkl — serialized XGBoost classifier
"""

import pickle
import random
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from xgboost import XGBClassifier
from features import extract_features


# ──────────────────────────────────────────────────────────
# Curated URL Datasets
# ──────────────────────────────────────────────────────────

SAFE_URLS = [
    # Major legitimate sites
    "https://www.google.com",
    "https://www.google.com/search?q=weather",
    "https://www.amazon.com/dp/B09V3KXJPB",
    "https://www.amazon.com/s?k=laptop",
    "https://github.com/torvalds/linux",
    "https://github.com/features",
    "https://stackoverflow.com/questions/tagged/python",
    "https://en.wikipedia.org/wiki/Machine_learning",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.reddit.com/r/programming",
    "https://www.microsoft.com/en-us/windows",
    "https://www.apple.com/iphone",
    "https://www.apple.com/shop/buy-mac",
    "https://www.netflix.com/browse",
    "https://www.linkedin.com/in/johndoe",
    "https://twitter.com/elonmusk",
    "https://www.facebook.com/groups/coding",
    "https://www.paypal.com/myaccount/home",
    "https://www.dropbox.com/home",
    "https://mail.google.com/mail/u/0",
    "https://docs.google.com/document/d/1abc",
    "https://www.nytimes.com/2024/01/01/tech.html",
    "https://www.bbc.com/news",
    "https://www.cnn.com/world",
    "https://www.reuters.com/technology",
    "https://www.npmjs.com/package/express",
    "https://pypi.org/project/flask",
    "https://developer.mozilla.org/en-US/docs/Web",
    "https://www.w3schools.com/html",
    "https://www.cloudflare.com/learning",
    "https://aws.amazon.com/s3",
    "https://cloud.google.com/compute",
    "https://azure.microsoft.com/en-us",
    "https://www.spotify.com/us/premium",
    "https://www.twitch.tv/directory",
    "https://www.ebay.com/sch/Electronics",
    "https://www.walmart.com/shop/deals",
    "https://www.target.com/c/electronics",
    "https://www.bestbuy.com/site/laptops",
    "https://www.ikea.com/us/en/rooms",
    "https://www.airbnb.com/s/New-York",
    "https://www.booking.com/city/us/new-york.html",
    "https://www.uber.com/us/en/ride",
    "https://www.zoom.us/join",
    "https://slack.com/features",
    "https://www.notion.so/product",
    "https://www.figma.com/design",
    "https://www.canva.com/create",
    "https://www.adobe.com/products/photoshop.html",
    "https://www.medium.com/@user/article",
]

PHISHING_URLS = [
    # Typosquatting / Brand impersonation
    "http://paypa1.com/login",
    "http://paypa1.com/us/webapps/mpp/account-verify",
    "http://paypall.com/signin",
    "http://g00gle.com/accounts/login",
    "http://googIe.com/signin",
    "http://micros0ft.com/account/verify",
    "http://microsft.com/office365/login",
    "http://amaz0n.com/gp/signin",
    "http://amazom.com/your-account",
    "http://faceb00k.com/login.php",
    "http://facebok.com/recover",
    "http://netfllx.com/login",
    "http://nettflix.com/account",
    "http://1cloud.com/login",
    "http://icloud-verify.com/account/login",
    "http://br-icloud.com.br",
    "http://apple-id-verify.com/signin",
    "http://appleid.apple.com-verify.net/signin",
    "http://linkedn.com/login",
    "http://llinkedin.com/checkpoint",
    
    # Deep subdomain nesting
    "http://secure.login.paypal.com.evil-site.net/auth",
    "http://accounts.google.com.verify-now.net/signin",
    "http://login.microsoft.com.secure-auth.xyz/office365",
    "http://www.amazon.com.orders.verify-account.tk/confirm",
    "http://icloud.com.apple-verify.support.cc/login",
    "http://login.apple.id.verify.secure.evil.com/auth",
    "http://update.accounts.google.com.reset.evil.net/password",
    "http://secure.bankofamerica.com.login.evil.biz/online",
    "http://my.wellsfargo.com.verify.evil.org/account",
    "http://chase.com.secure-login.fraud-alert.net/signin",
    
    # IP address as hostname
    "http://192.168.1.100/paypal/login.php",
    "http://45.33.32.156/secure/amazon-verify.html",
    "http://103.224.182.250/google-accounts/signin",
    "http://185.220.101.1/apple/verify-id.php",
    "http://91.108.56.200/microsoft/office365-login",
    
    # Suspicious keywords + long URLs
    "http://secure-login-verify-account-update.com/signin?ref=email&token=abc123",
    "http://account-verify-secure-banking-alert.net/login?user=test&confirm=true",
    "http://unusual-activity-alert-notification-confirm.org/restore-account",
    "http://password-reset-confirm-credential-update.com/billing/verify",
    "http://banking-security-alert-suspend-notification.com/unlock-account",
    "http://limited-access-restore-account-verify.net/authenticate",
    "http://wallet-billing-confirm-secure-update.org/credential-reset",
    "http://signin-authenticate-verify-restore.com/suspend-alert",
    
    # @ symbol abuse (credential harvesting)
    "http://google.com@evil-phishing-site.net/login",
    "http://paypal.com@phishing-domain.tk/verify",
    "http://apple.com@malicious-site.xyz/icloud",
    
    # Encoded/obfuscated
    "http://evil.com/%70%61%79%70%61%6C/login",
    "http://evil.com/google//accounts//signin",
    "http://phish.net/amazon//verify//account//update",
    
    # Random/suspicious domains
    "http://x4k9m2.tk/login/paypal",
    "http://abc123xyz.ml/secure/google-verify",
    "http://random-domain-12345.ga/apple-id-signin",
    "http://verify-now-urgent.cc/banking-login",
    "http://click-here-confirm.top/account-suspended",
]


def augment_url(url: str, is_phishing: bool) -> list[str]:
    """Generate augmented variations of a URL to expand the dataset."""
    variations = [url]
    
    if is_phishing:
        # Add path variations
        suffixes = [
            '/login', '/signin', '/verify', '/confirm', '/update',
            '/account', '/secure', '/auth', '/password-reset',
            '?token=abc123&ref=email', '?user=admin&action=verify',
        ]
        for suffix in random.sample(suffixes, min(3, len(suffixes))):
            if not url.endswith(suffix):
                variations.append(url.rstrip('/') + suffix)
        
        # Add query parameter noise
        params = ['token=xyz', 'ref=email', 'action=verify', 'confirm=1', 'id=12345']
        sep = '&' if '?' in url else '?'
        variations.append(url + sep + '&'.join(random.sample(params, 2)))
    else:
        # Add common safe path variations
        safe_paths = ['/about', '/contact', '/products', '/blog', '/docs', '/help']
        for path in random.sample(safe_paths, 2):
            base = url.split('?')[0].rstrip('/')
            variations.append(base + path)
    
    return variations


def build_dataset():
    """Build training dataset from curated URLs with augmentation."""
    urls = []
    labels = []
    
    # Process safe URLs
    for url in SAFE_URLS:
        augmented = augment_url(url, is_phishing=False)
        for aug_url in augmented:
            urls.append(aug_url)
            labels.append(0)
    
    # Process phishing URLs
    for url in PHISHING_URLS:
        augmented = augment_url(url, is_phishing=True)
        for aug_url in augmented:
            urls.append(aug_url)
            labels.append(1)
    
    # Extract features
    X = np.array([extract_features(url) for url in urls])
    y = np.array(labels)
    
    print(f"Dataset: {len(urls)} samples ({sum(labels)} phishing, {len(labels) - sum(labels)} safe)")
    return X, y


def train():
    """Train XGBoost model and save to disk."""
    print("=" * 60)
    print("  XGBoost Phishing URL Classifier — Training")
    print("=" * 60)
    
    random.seed(42)
    np.random.seed(42)
    
    X, y = build_dataset()
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"\nTrain: {len(X_train)} samples")
    print(f"Test:  {len(X_test)} samples")
    
    # Train XGBoost
    model = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric='logloss',
        random_state=42,
        use_label_encoder=False,
    )
    
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    
    # Evaluate
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    
    print("\n" + "=" * 60)
    print("  Evaluation Results")
    print("=" * 60)
    print(f"\nAccuracy: {accuracy_score(y_test, y_pred):.4f}")
    print(f"\n{classification_report(y_test, y_pred, target_names=['Safe', 'Phishing'])}")
    
    # Feature importance
    feature_names = [
        'url_length', 'hostname_length', 'has_ip_in_host',
        'at_symbol_count', 'dash_count', 'question_mark_count',
        'equals_count', 'percent_count', 'double_slash_count',
        'subdomain_depth', 'path_depth', 'has_https',
        'url_entropy', 'brand_min_distance', 'suspicious_keywords',
    ]
    importances = model.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]
    
    print("\nTop Feature Importances:")
    for i in sorted_idx[:10]:
        print(f"  {feature_names[i]:25s} {importances[i]:.4f}")
    
    # Save model
    with open('model.pkl', 'wb') as f:
        pickle.dump(model, f)
    
    print(f"\n[OK] Model saved to model.pkl")
    print("=" * 60)


if __name__ == '__main__':
    train()
