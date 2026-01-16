sub vcl_recv {
    # Validate Edge-Auth header format
    # Format: timestamp,pop,signature
    if (!req.http.Edge-Auth || !req.http.Edge-Auth ~ "^([0-9]+),([^,]+),(0x[0-9a-f]{64})$") {
        error 403 "Invalid Edge-Auth header format";
    }

    declare local var.timestamp STRING;
    declare local var.pop STRING;
    declare local var.signature STRING;
    declare local var.data STRING;
    declare local var.secret STRING;
    
    set var.timestamp = re.group.1;
    set var.pop = re.group.2;
    set var.signature = re.group.3;
    
    # Reconstruct the data string that was signed
    set var.data = var.timestamp + "," + var.pop;
    
    # Get the secret using hardcoded ID
    set var.secret = table.lookup(vce_shared_secret, "compute_auth_key");
    
    if (!var.secret) {
        error 403 "Secret not configured";
    }

    # Verify signature
    if (!digest.secure_is_equal(digest.hmac_sha256(var.secret, var.data), var.signature)) {
        error 403 "Invalid signature";
    }

    # Verify timestamp is within 2 seconds
    declare local var.request_time TIME;
    set var.request_time = std.time(var.timestamp, std.integer2time(-1));
    
    if (!time.is_after(var.request_time, time.sub(now, 2s)) || 
        !time.is_after(time.add(now, 2s), var.request_time)) {
        error 403 "Request expired";
    }
}