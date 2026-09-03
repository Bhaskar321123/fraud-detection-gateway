const data = JSON.stringify({
    text: "URGENT! Your bank account is locked. Click http://secure-banklogin.xyz to verify now! Call +1-800-555-0199"
});

fetch('http://localhost:8080/api/analyze.php', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: data
})
.then(response => response.text())
.then(text => console.log("SERVER RESPONSE:\n", text))
.catch(error => console.error("ERROR:", error));
