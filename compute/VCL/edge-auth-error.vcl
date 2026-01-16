if (obj.status == 403 && obj.response ~ "^VCE ") {
    set obj.http.Content-Type = "text/plain";
    synthetic {"Edge Authentication Guard: "} obj.response;
    return(deliver);
}