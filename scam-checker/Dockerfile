FROM php:8.2-apache

# Enable mod_rewrite if needed by APIs
RUN a2enmod rewrite

# Copy the scam-checker files to the Apache web root
COPY . /var/www/html/

# Expose port 80
EXPOSE 80

# Configure Apache to pass environment variables to PHP
RUN echo "PassEnv GOOGLE_SAFE_BROWSING_KEY VIRUSTOTAL_KEY GEMINI_API_KEY" >> /etc/apache2/conf-enabled/environment.conf
