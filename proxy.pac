function FindProxyForURL(url, host) {
    if (url.substring(0,5) !== 'http:') {
        return "DIRECT";
    }
    return "PROXY 127.0.0.1:10000;DIRECT;";
}
