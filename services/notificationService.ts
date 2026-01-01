
import { UserProfile, Product } from '../types';

// --- TYPES ---

interface WeatherData {
    uv_index_max: number;
    relative_humidity_2m_min: number;
    temperature_2m_max: number;
}

// FIX: Define extended types for Notification actions which might be missing in standard lib
interface NotificationAction {
    action: string;
    title: string;
    icon?: string;
}

interface ExtendedNotificationOptions extends NotificationOptions {
    actions?: NotificationAction[];
}

// --- HELPER: REQUEST PERMISSION ---
export const requestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    
    if (Notification.permission === 'granted') return true;
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    return false;
};

// --- HELPER: SEND NOTIFICATION (VIA SERVICE WORKER) ---
const triggerNotification = async (title: string, options: ExtendedNotificationOptions) => {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        // This simulates a push event for local logic
        // Cast to any to bypass TS check if NotificationOptions definition is missing actions
        registration.showNotification(title, options as any);
    }
};

// --- LOGIC 1: ENVIRONMENTAL ALERTS ---
const checkWeather = async (): Promise<void> => {
    const lastCheck = localStorage.getItem('skinos_last_weather_alert');
    const today = new Date().toDateString();
    
    // Avoid spam: Only one weather alert per day
    if (lastCheck === today) return;

    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const { latitude, longitude } = position.coords;
            // Using Open-Meteo (Free, No Key)
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,uv_index_max&hourly=relative_humidity_2m&timezone=auto&forecast_days=1`
            );
            const data = await response.json();
            
            const daily = data.daily;
            const hourly = data.hourly;
            
            const maxUV = daily.uv_index_max[0];
            // Get min humidity from hourly (approximate)
            const minHumidity = Math.min(...(hourly.relative_humidity_2m as number[]));

            let notificationSent = false;

            if (maxUV >= 6) {
                await triggerNotification("High UV Alert ☀️", {
                    body: `UV Index is ${maxUV} today. Don't forget your SPF!`,
                    icon: 'https://placehold.co/192x192/fbbf24/ffffff.png?text=UV',
                    tag: 'weather-uv',
                    data: { url: '/shelf' }, // Deep link to shelf to check SPF
                    actions: [
                        { action: 'add_product', title: 'Check My SPF' }
                    ]
                });
                notificationSent = true;
            } else if (minHumidity < 30) {
                await triggerNotification("Dry Air Detected 💧", {
                    body: "Humidity is low today. Consider a richer moisturizer tonight.",
                    icon: 'https://placehold.co/192x192/3b82f6/ffffff.png?text=Dry',
                    tag: 'weather-dry',
                    data: { url: '/shelf' },
                    actions: [
                        { action: 'add_product', title: 'Update Routine' }
                    ]
                });
                notificationSent = true;
            }

            if (notificationSent) {
                localStorage.setItem('skinos_last_weather_alert', today);
            }

        } catch (e) {
            console.error("Weather Check Failed", e);
        }
    }, (err) => console.log("Geo denied", err));
};

// --- LOGIC 2: ONBOARDING GAPS ---
const checkOnboardingGaps = async (user: UserProfile, shelf: Product[]) => {
    const lastCheck = localStorage.getItem('skinos_last_onboarding_nudge');
    const now = Date.now();
    
    // Only check once every 2 days
    if (lastCheck && now - parseInt(lastCheck) < 48 * 60 * 60 * 1000) return;

    // Estimate account age (using first scan timestamp or fallback)
    const startTimestamp = user.scanHistory?.[user.scanHistory.length - 1]?.timestamp || Date.now();
    const hoursSinceStart = (now - startTimestamp) / (1000 * 60 * 60);

    // Only nudge if user is "new" (24h - 7 days old)
    if (hoursSinceStart < 24 || hoursSinceStart > 168) return;

    if (shelf.length === 0) {
        await triggerNotification("Your shelf is lonely! 🧴", {
            body: "Add your current products to track their shelf life and match score.",
            tag: 'onboard-shelf',
            data: { url: '/scanner' },
            actions: [{ action: 'add_product', title: 'Scan Product' }]
        });
        localStorage.setItem('skinos_last_onboarding_nudge', now.toString());
    } 
    else if (!user.usage?.routineGenerations) {
        await triggerNotification("Need a plan? ✨", {
            body: "Let our Routine Architect recommend the best product match for you.",
            tag: 'onboard-routine',
            data: { url: '/routine-builder' }, // Assuming routing handles this
            actions: [{ action: 'scan_now', title: 'Build Routine' }]
        });
        localStorage.setItem('skinos_last_onboarding_nudge', now.toString());
    }
};

// --- LOGIC 3: WEEKLY HABIT ---
const checkWeeklyHabit = async (user: UserProfile) => {
    const lastScan = user.biometrics.timestamp;
    const now = Date.now();
    const daysSince = (now - lastScan) / (1000 * 60 * 60 * 24);

    // If it's been ~7 days (allow margin) and we haven't notified today
    const lastNotified = localStorage.getItem('skinos_last_weekly_nudge');
    const today = new Date().toDateString();

    if (daysSince >= 7 && lastNotified !== today) {
        await triggerNotification("Weekly Skin Check 📸", {
            body: "It's been a week! Scan now to track your progress.",
            icon: 'https://placehold.co/192x192/14b8a6/ffffff.png?text=Scan',
            tag: 'habit-weekly',
            data: { url: '/scanner' },
            actions: [{ action: 'scan_now', title: 'Scan Face' }]
        });
        localStorage.setItem('skinos_last_weekly_nudge', today);
    }
};

// --- LOGIC 4: ENGAGEMENT (FREE USERS) ---
const checkUsage = async (user: UserProfile) => {
    if (user.isPremium) return;
    
    const usage = user.usage?.manualScans || 0;
    const limit = 3;
    const left = limit - usage;

    const lastCheck = localStorage.getItem('skinos_last_usage_nudge');
    const now = Date.now();
    
    // Nudge once a week
    if (lastCheck && now - parseInt(lastCheck) < 7 * 24 * 60 * 60 * 1000) return;

    if (left > 0) {
        await triggerNotification("Free Scans Remaining 🎁", {
            body: `You have ${left} free scans left. Check a product today!`,
            tag: 'engagement-usage',
            data: { url: '/scanner' },
            actions: [{ action: 'add_product', title: 'Scan Item' }]
        });
        localStorage.setItem('skinos_last_usage_nudge', now.toString());
    }
};

// --- MAIN RUNNER ---
export const runNotificationEngine = async (user: UserProfile | null, shelf: Product[]) => {
    if (!user) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;

    // Run checks sequentially
    await checkOnboardingGaps(user, shelf);
    await checkWeather(); // Geolocated
    await checkWeeklyHabit(user);
    await checkUsage(user);
};
