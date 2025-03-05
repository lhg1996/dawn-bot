const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Untuk membaca file .env

// Import axios-proxy-fix
const axiosProxyFix = require('axios-proxy-fix');

const apiEndpoints = {
    keepalive: "https://www.aeropres.in/chromeapi/dawn/v1/userreward/keepalive",
    getPoints: "https://www.aeropres.in/api/atom/v1/userreferral/getpoint"
};

const ignoreSslAgent = new https.Agent({
    rejectUnauthorized: false
});

const randomDelay = (min, max) => {
    return new Promise(resolve => {
        const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
        setTimeout(resolve, delayTime * 1000);
    });
};

const displayWelcome = () => {
    console.log(`
                \x1b[32m🌟 DAWN Validator Extension automatic claim 🌟\x1b[0m
    `);
};

const appIdPrefix = "6752b";

const generateAppId = (token) => {
    const hash = crypto.createHash('md5').update(token).digest('hex');
    return `${appIdPrefix}${hash.slice(0, 19)}`;
};

const appIdFilePath = path.join(__dirname, 'appIds.json');

const loadAppIds = () => {
    if (fs.existsSync(appIdFilePath)) {
        return JSON.parse(fs.readFileSync(appIdFilePath, 'utf-8'));
    }
    return {};
};

const saveAppIds = (appIds) => {
    fs.writeFileSync(appIdFilePath, JSON.stringify(appIds, null, 2));
};

const fetchPoints = async (headers, appId, proxy) => {
    try {
        const response = await axios.get(`${apiEndpoints.getPoints}?appid=${appId}`, {
            headers,
            httpsAgent: ignoreSslAgent,
            proxy: proxy // Gunakan proxy jika ada
        });

        if (response.status === 200 && response.data.status) {
            const { rewardPoint, referralPoint } = response.data.data;
            const totalPoints = (
                (rewardPoint.points || 0) +
                (rewardPoint.registerpoints || 0) +
                (rewardPoint.signinpoints || 0) +
                (rewardPoint.twitter_x_id_points || 0) +
                (rewardPoint.discordid_points || 0) +
                (rewardPoint.telegramid_points || 0) +
                (rewardPoint.bonus_points || 0) +
                (referralPoint.commission || 0)
            );
            return totalPoints;
        } else if (response.status === 429) {
            // Handle rate limiting
            const retryAfter = parseInt(response.headers['retry-after']) || 60;
            console.warn(`⚠️ Rate limit exceeded for proxy ${proxy.host}:${proxy.port}. Retrying after ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return fetchPoints(headers, appId, proxy); // Retry the request
        } else {
            console.error(`❌ Failed to retrieve the points: ${response.data.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error(`⚠️ Error during fetching the points: ${error.message}`);
    }
    return 0;
};

const keepAliveRequest = async (headers, email, appId, proxy) => {
    const payload = {
        username: email,
        extensionid: "fpdkjdnhkakefebpekbdhillbhonfjjp",
        numberoftabs: 0,
        _v: "1.1.2"
    };

    try {
        const response = await axios.post(`${apiEndpoints.keepalive}?appid=${appId}`, payload, {
            headers,
            httpsAgent: ignoreSslAgent,
            proxy: proxy // Gunakan proxy jika ada
        });

        if (response.status === 200) {
            return true;
        } else if (response.status === 429) {
            // Handle rate limiting
            const retryAfter = parseInt(response.headers['retry-after']) || 60;
            console.warn(`⚠️ Rate limit exceeded for proxy ${proxy.host}:${proxy.port}. Retrying after ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return keepAliveRequest(headers, email, appId, proxy); // Retry the request
        } else {
            console.warn(`🚫 Keep-Alive Error for ${email}: ${response.status} - ${response.data.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error(`⚠️ Error during keep-alive request for ${email}: ${error.message}`);
    }
    return false;
};

const countdown = async (seconds) => {
    for (let i = seconds; i > 0; i--) {
        process.stdout.write(`⏳ Next process in: ${i} seconds...\r`);
        await randomDelay(1, 1);
    }
    console.log("\n🔄 Restarting...\n");
};

const validateProxies = async (proxies) => {
    const testUrl = "http://www.google.com"; // Situs uji coba

    // Validasi semua proxy secara paralel
    const validationPromises = proxies.map(async (proxy) => {
        try {
            const response = await axios.get(testUrl, {
                proxy: proxy,
                timeout: 5000 // Batas waktu 5 detik
            });

            if (response.status === 200) {
                console.log(`✅ Proxy Valid: ${proxy.host}:${proxy.port}`);
                return proxy; // Kembalikan proxy yang valid
            }
        } catch (error) {
            console.error(`❌ Proxy Invalid: ${proxy.host}:${proxy.port} - ${error.message}`);
        }
        return null; // Kembalikan null jika proxy tidak valid
    });

    // Tunggu semua validasi selesai
    const results = await Promise.all(validationPromises);

    // Filter hanya proxy yang valid
    return results.filter(proxy => proxy !== null);
};

const processAccount = async (account, proxies, appIds) => {
    const { email, token } = account;
    const extensionId = "fpdkjdnhkakefebpekbdhillbhonfjjp";

    let appId = appIds[email];
    if (!appId) {
        appId = generateAppId(token);
        appIds[email] = appId;
        saveAppIds(appIds);
    }

    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": `chrome-extension://${extensionId}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site"
    };

    // Rotasi proxy untuk setiap akun
    for (const proxy of proxies) {
        console.log(`🔍 Trying proxy: ${proxy.host}:${proxy.port} for account: ${email}`);

        try {
            const points = await fetchPoints(headers, appId, proxy);

            console.log(`🔍 Processing: \x1b[36m${email}\x1b[0m, Proxy: \x1b[33m${proxy.host}:${proxy.port}\x1b[0m, Points: \x1b[32m${points}\x1b[0m`);

            const success = await keepAliveRequest(headers, email, appId, proxy);
            if (success) {
                console.log(`✅ Keep-Alive Success for: \x1b[36m${email}\x1b[0m`);
                return points; // Berhenti jika berhasil
            } else {
                console.warn(`❌ Keep-Alive Failed for: \x1b[36m${email}\x1b[0m`);
            }
        } catch (error) {
            console.error(`⚠️ Error with proxy ${proxy.host}:${proxy.port} for account ${email}: ${error.message}`);
        }
    }

    console.warn(`⚠️ All proxies failed for account: ${email}`);
    return 0;
};

const loadAccountsFromEnv = () => {
    const accounts = [];
    const envAccounts = process.env.ACCOUNTS.split(';'); // Pisahkan akun dengan ;
    envAccounts.forEach(account => {
        const [email, token] = account.split(':'); // Format: email:token
        accounts.push({ email, token });
    });
    return accounts;
};

const loadProxiesFromFile = () => {
    const proxies = [];
    if (fs.existsSync('proxy.txt')) {
        const proxyData = fs.readFileSync('proxy.txt', 'utf-8');
        proxyData.split('\n').forEach(line => {
            if (line.trim()) {
                const [protocol, authHostPort] = line.split('//');
                const [auth, hostPort] = authHostPort.split('@');
                const [username, password] = auth.split(':');
                const [host, port] = hostPort.split(':');
                proxies.push({
                    protocol: protocol.replace(':', ''),
                    host,
                    port: parseInt(port),
                    auth: { username, password }
                });
            }
        });
    }
    return proxies;
};

const config = {
    useProxy: process.env.USE_PROXY === 'true', // Set to true if you want to use proxies, false otherwise
    restartDelay: parseInt(process.env.RESTART_DELAY) || 207, // Delay in seconds before restarting the process
    minDelay: parseInt(process.env.MIN_DELAY) || 3, // Random delay for keepalive packet send
    maxDelay: parseInt(process.env.MAX_DELAY) || 10, // Random delay for keepalive packet send
};

const processAccounts = async () => {
    displayWelcome();
    const accounts = loadAccountsFromEnv();
    const proxies = loadProxiesFromFile();

    // Validasi semua proxy sebelum mulai
    const validProxies = await validateProxies(proxies);
    if (validProxies.length === 0) {
        console.error("❌ No valid proxies available. Exiting...");
        return;
    }

    const appIds = loadAppIds();

    while (true) {
        const accountPromises = accounts.map((account) => {
            return processAccount(account, validProxies, appIds);
        });

        const pointsArray = await Promise.all(accountPromises);
        const totalPoints = pointsArray.reduce((acc, points) => acc + points, 0);

        console.log(`📋 All accounts processed. Total points: \x1b[32m${totalPoints}\x1b[0m`);
        await countdown(config.restartDelay);
    }
};

processAccounts();
