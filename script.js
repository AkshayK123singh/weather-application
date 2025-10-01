let intervalId = null;
let dailyDataCache = {};
const PIXABAY_API_KEY = '52422699-2c41bc31c0747010f39589fc6';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const cache = {
    weather: {},
    monthly: {}
};

// Placeholder for Normal Condition Data (easily replaceable with a real API call)
const NORMAL_TEMP_DAILY_AVG_C = 28.5; 
const NORMAL_TEMP_SWING_C = 9.0;
const NORMAL_HUMIDITY_AVG_PERCENT = 70;
const NORMAL_WINDSPEED_AVG_KMH = 15;

// =========================================================================
// ATMOSPHERIC COMFORT & HEALTH THRESHOLDS (All values in °C, kPa, or km/h)
// =========================================================================

const CITY_ACCLIMATIZATION = 0; 
const DRY_AIR_RISK_DP_C = 10.0;
const MUGGY_DP_C = 16.0; 
const OPPRESSIVE_DP_C = 21.0; 
const MODERATE_HEAT_INDEX_C = 32.0; 
const DANGER_HEAT_INDEX_C = 41.0; 

// WIND THRESHOLDS (km/h)
const WIND_COMFORT_KMH = 15; 
const WIND_ADVISORY_KMH = 30; 
const WIND_DANGER_KMH = 50; 

// SOLAR RADIATION THRESHOLDS (W/m²)
const SOLAR_MAX_WMSQ = 1000; // Max possible GHI (100% of scale)
const SOLAR_HIGH_WMSQ = 600; 
const SOLAR_MEDIUM_WMSQ = 300; 
const SOLAR_MIN_WMSQ = 0;

// NEW: MARINE THRESHOLDS
const WAVE_HEIGHT_CALM_M = 1; // Calm seas
const WAVE_HEIGHT_MODERATE_M = 2;
const WAVE_HEIGHT_ROUGH_M = 3; // Rough seas

const SST_COLD_C = 15; // Cold water
const SST_OPTIMAL_C = 20; // Comfortable for swimming
const SST_WARM_C = 25; // Warm water


function convertTempToUnit(tempC, unit) {
    // FIX 1: Ensure input is a valid finite number before conversion
    if (tempC === 'N/A' || !isFinite(tempC) || tempC === null) {
        return tempC; // Return non-numeric values unchanged
    }

    const temp = parseFloat(tempC);

    if (unit === 'imperial') {
        return (temp * 9/5 + 32).toFixed(1);
    }
    return temp.toFixed(1);
}

function convertSpeedToUnit(speedKmH, unit) {
    if (speedKmH === 'N/A' || !isFinite(speedKmH) || speedKmH === null) {
        return speedKmH; // Return non-numeric values unchanged
    }
    const speed = parseFloat(speedKmH);
    
    if (unit === 'imperial') {
        // 1 km/h ≈ 0.621371 mph
        return (speed * 0.621371).toFixed(1);
    }
    return speed.toFixed(1);
}

// --- NEW CONVERSION FUNCTION FOR LENGTH/HEIGHT (Meters to Feet) ---
function convertLengthToUnit(lengthM, unit) {
    if (lengthM === 'N/A' || !isFinite(lengthM) || lengthM === null) {
        return lengthM;
    }
    const length = parseFloat(lengthM);
    
    if (unit === 'imperial') {
        // 1 meter ≈ 3.28084 feet
        return (length * 3.28084).toFixed(1);
    }
    return length.toFixed(1);
}
// -------------------------------------------------------------------

async function fetchLandmarkImage(cityName, weatherCondition) {
    try {
        let weatherTerm = '';
        switch (weatherCondition) {
            case 'clear':
                weatherTerm = 'calm';
                break;
            case 'cloudy':
                weatherTerm = 'cloudy';
                break;
            case 'rainy':
            case 'showers':
                weatherTerm = 'rainy';
                break;
            case 'snowy':
                weatherTerm = 'frozen';
                break;
            case 'thunderstorm':
                weatherTerm = 'stormy';
                break;
            case 'hazy':
                weatherTerm = 'hazy';
                break;
            default:
                weatherTerm = '';
        }

        const query = `${encodeURIComponent(cityName)}+${weatherTerm}+water`;
        const apiUrl = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${query}&image_type=photo&orientation=horizontal&per_page=10`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.hits && data.hits.length > 0) {
            const randomIndex = Math.floor(Math.random() * data.hits.length);
            return `url("${data.hits[randomIndex].largeImageURL}")`;
        } else {
            console.log("No images found for the city, falling back to weather background.");
            return null;
        }
    } catch (error) {
        console.error("Error fetching image from Pixabay API:", error);
        return null;
    }
}

function toggleRainAnimation(weatherCondition) {
    const weatherApp = document.querySelector('.weather-app');
    if (!weatherApp) return;

    if (weatherCondition === 'rainy' || weatherCondition === 'showers' || weatherCondition === 'thunderstorm') {
        let rainContainer = document.querySelector('.rain');
        if (!rainContainer) {
            rainContainer = document.createElement('div');
            rainContainer.classList.add('rain');
            document.body.appendChild(rainContainer);
        }
        rainContainer.classList.add('active');
    } else {
        const rainContainer = document.querySelector('.rain');
        if (rainContainer) {
            rainContainer.classList.remove('active');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const cityInput = document.getElementById('city-input');
    const searchBtn = document.getElementById('search-btn');
    const unitSwitch = document.getElementById('unit-switch');
    let currentUnit = 'metric';
    let currentCity = 'New Delhi';

    const navLinks = document.querySelectorAll('.main-nav .nav-link');
    
    // NEW: Add event listeners for new sections
    const solarRadiationLink = document.querySelector('[data-target="solar-radiation-container"]');
    const aqiLink = document.querySelector('[data-target="aqi-container"]');
    const cloudCoverLink = document.querySelector('[data-target="cloud-cover-container"]');
    

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const targetId = link.getAttribute('data-target');
            
            document.querySelectorAll('.info-section').forEach(section => {
                section.style.display = 'none';
            });

            // The Dashboard, Forecast, and Comfort Insight are grouped in the new layout but must be managed
            // by their IDs. We ensure the side-by-side elements are visible when the dashboard is active.
            if (targetId === 'dashboard-container') {
                document.getElementById('left-insight-column').style.display = 'block'; // Comfort Insight
                document.getElementById('dashboard-container').style.display = 'block'; // Dashboard
                document.getElementById('forecast-window').style.display = 'block'; // Forecast remains below
                document.getElementById('atmosphere-insight-box').style.display = 'block';
                // Re-render the combined insight when coming back to the dashboard
                renderAllDashboardInsights(dailyDataCache.hourlyData, dailyDataCache.dailyData, dailyDataCache.aqiData, currentUnit); 
            }
            
            if (targetId) {
                const infoSections = document.querySelectorAll('.info-section');
                infoSections.forEach(section => {
                    if (section.id === targetId) {
                        section.style.display = 'block';
                    }
                });
                
                // Specific rendering logic for each section
                switch(targetId) {
                    case 'hourly-temperature-container':
                        renderAllHourlyTempCharts(dailyDataCache.hourlyData, currentUnit);
                        break;
                    case 'humidity-container':
                        renderAllHumidityCharts(dailyDataCache.hourlyData, currentUnit);
                        // renderHumidityInsight is called inside renderAllHumidityCharts
                        break;
                    case 'wind-container':
                        renderAllWindCharts(dailyDataCache.hourlyData, currentUnit);
                        // renderWindInsight is called inside renderAllWindCharts
                        break;
                    case 'solar-radiation-container': 
                        renderSolarRadiationCharts(dailyDataCache.hourlyData, currentUnit);
                        break;
                    case 'aqi-container': // NEW AQI LOGIC
                        renderAllAqiCharts(dailyDataCache.hourlyData, dailyDataCache.aqiData, currentUnit);
                        break;
                    case 'cloud-cover-container': // NEW CLOUD LOGIC
                        renderAllCloudCharts(dailyDataCache.hourlyData, currentUnit);
                        break;
                }
            }
        });
    });

    searchBtn.onclick = () => {
        const city = cityInput.value.trim();
        if (!city) return;
        currentCity = city;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        getDataForCity(city, currentUnit);
    };

    cityInput.addEventListener('focus', () => cityInput.classList.add('focused'));
    cityInput.addEventListener('blur', () => cityInput.classList.remove('focused'));

    unitSwitch.addEventListener('change', () => {
        currentUnit = unitSwitch.checked ? 'imperial' : 'metric';
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        getDataForCity(currentCity, currentUnit);
    });

    getDataForCity('New Delhi', currentUnit);
});

async function getDataForCity(city, unit) {
    const weatherDisplay = document.getElementById('weather-display');

    weatherDisplay.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p class="loading-text">Loading data for "${city}"...</p>
        </div>
    `;
    document.getElementById('atmosphere-recommendation').innerHTML = 'Analyzing current conditions for daily life impact...';

    const now = Date.now();
    const cachedWeatherData = cache.weather[city];

    if (cachedWeatherData && now - cachedWeatherData.timestamp < CACHE_DURATION_MS) {
        console.log("Using cached weather data.");
        const { hourlyWeatherData, dailyWeatherData, aqiData } = cachedWeatherData.data;
        dailyDataCache = { dailyData: dailyWeatherData.daily, hourlyData: hourlyWeatherData.hourly, aqiData: aqiData };
        updateWeatherUI(city, dailyWeatherData.daily, hourlyWeatherData.hourly, aqiData, unit);
        updateClockAndWeather(city, hourlyWeatherData.timezone, 'clear', unit, dailyWeatherData.daily, hourlyWeatherData.hourly, aqiData);
    } else {
        try {
            const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}`);
            const geoData = await geoResp.json();
            if (!geoData.results || !geoData.results.length) {
                weatherDisplay.innerHTML = `<div class="error-message">City not found. Please try again.</div>`;
                return;
            }
            const { latitude, longitude } = geoData.results[0];
            const today = new Date();
            const todayStr = today.toISOString().slice(0, 10);
            
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().slice(0, 10);
            
            // --- MODIFIED API CALL: SOIL REMOVED FOR STABILITY ---
            const commonHourlyParams = 'temperature_2m,relative_humidity_2m,dew_point_2m,vapour_pressure_deficit,windspeed_10m,precipitation,apparent_temperature,weathercode,temperature_80m,temperature_120m,temperature_180m,windspeed_80m,windspeed_120m,windspeed_180m,shortwave_radiation,direct_radiation,cloudcover';
            
            // REMOVED SOIL VARS. Only marine left.
            const optionalHourlyParams = 'significant_wave_height,sea_surface_temperature';

            // 1. Fetch common hourly data (should be stable)
            const hourlyWeatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=${commonHourlyParams}&start_date=${yesterdayStr}&end_date=${tomorrowStr}&timezone=auto${unit === 'imperial' ? '&temperature_unit=fahrenheit&windspeed_unit=mph' : ''}`);
            
            // 2. Fetch optional marine data separately. 
            const optionalWeatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=${optionalHourlyParams}&start_date=${yesterdayStr}&end_date=${tomorrowStr}&timezone=auto${unit === 'imperial' ? '&temperature_unit=fahrenheit&windspeed_unit=mph' : ''}`);

            // 3. Fetch daily data
            const dailyWeatherResp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,relative_humidity_2m_max,windspeed_10m_max,uv_index_max&forecast_days=10&${unit === 'imperial' ? 'temperature_unit=fahrenheit&windspeed_unit=mph' : 'windspeed_unit=kmh'}&timezone=auto`);
            
            // 4. Fetch AQI data
            const aqiResp = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&start_date=${todayStr}&end_date=${tomorrowStr}&hourly=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=auto`);

            // We only check the ESSENTIAL responses here.
            if (!hourlyWeatherResp.ok || !dailyWeatherResp.ok || !aqiResp.ok) {
                throw new Error("One or more essential weather APIs failed to respond. Check API keys or base URL.");
            }

            const [hourlyWeatherData, dailyWeatherData, aqiData] = await Promise.all([
                hourlyWeatherResp.json(),
                dailyWeatherResp.json(),
                aqiResp.json()
            ]);
            
            // --- CONSOLIDATE DATA: Merge optional data into hourlyData ---
            if (optionalWeatherResp.ok) {
                const optionalWeatherData = await optionalWeatherResp.json();
                Object.assign(hourlyWeatherData.hourly, optionalWeatherData.hourly);
            } else {
                // If optional fails (400), the keys simply won't be in hourlyData, which is handled
                // gracefully by the rendering functions (they show an "unavailable" message).
                console.warn("Optional marine data failed to load. Displaying only available data.");
            }
            // --- END CONSOLIDATE DATA ---

            const weatherData = { hourlyWeatherData, dailyWeatherData, aqiData };
            cache.weather[city] = { data: weatherData, timestamp: now };
            dailyDataCache = { dailyData: dailyWeatherData.daily, hourlyData: hourlyWeatherData.hourly, aqiData: aqiData };

            updateWeatherUI(city, dailyWeatherData.daily, hourlyWeatherData.hourly, aqiData, unit);
            updateClockAndWeather(city, hourlyWeatherData.timezone, 'clear', unit, dailyWeatherData.daily, hourlyWeatherData.hourly, aqiData);

        } catch (error) {
            weatherDisplay.innerHTML = `<div class="error-message">Failed to load data. Please check the city name and try again. Error: ${error.message}</div>`;
            console.error("Error fetching data:", error);
        }
    }
}

function findPeakData(dataArray, timeArray) {
    let peakValue = -Infinity;
    let peakTime = 'N/A';
    
    const todayTemps = dataArray.slice(24, 48);
    const todayTimes = timeArray.slice(24, 48);

    todayTemps.forEach((value, index) => {
        if (value !== null && value > peakValue) {
            peakValue = value;
            peakTime = new Date(todayTimes[index]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
    });

    return { peakValue, peakTime };
}

// -------------------------------------------------------------------
// NEW: MASTER INSIGHT FUNCTION
// -------------------------------------------------------------------

function renderAllDashboardInsights(hourlyData, dailyData, aqiData, unit) {
    // Run all specialized functions and gather the structured objects
    const tempHumidity = getAtmosphereInsight(hourlyData, unit);
    const aqi = getAqiInsight(aqiData);
    const uv = getUvInsight(dailyData);
    const wind = getWindActionInsight(hourlyData, unit);
    
    const recommendationElement = document.getElementById('atmosphere-recommendation');
    
    // Consolidate and rewrite in a modern, highlighted style
    recommendationElement.innerHTML = `
        <style>
            .insight-item {
                margin-bottom: 15px; 
                padding-bottom: 10px; 
                border-bottom: 1px dashed rgba(255, 255, 255, 0.2);
            }
            .insight-item:last-child {
                border-bottom: none;
                margin-bottom: 0;
                padding-bottom: 0;
            }
            .risk-level {
                font-weight: 800; 
                font-size: 1.1em;
                margin-left: 10px;
                display: inline-block;
            }
            .main-message {
                margin: 5px 0 0 0;
                font-size: 1em;
            }
            .action-advice {
                margin: 5px 0 0 0;
                font-weight: bold;
                font-size: 1em;
            }
        </style>

        <div class="insight-item">
            <strong style="color: #FFC107;">🌡️ HEAT & COMFORT:</strong>
            <span class="risk-level" style="color: ${tempHumidity.riskColor};">${tempHumidity.riskLevel}</span>
            <p class="main-message">${tempHumidity.message}</p>
            <p class="action-advice" style="color: ${tempHumidity.adviceColor};">${tempHumidity.action}</p>
        </div>
        
        <div class="insight-item">
            <strong style="color: #00cc66;">😷 AIR QUALITY (AQI):</strong>
            <span class="risk-level" style="color: ${aqi.riskColor};">${aqi.riskLevel}</span>
            <p class="main-message">${aqi.message}</p>
            <p class="action-advice" style="color: ${aqi.adviceColor};">${aqi.action}</p>
        </div>

        <div class="insight-item">
            <strong style="color: #FF8C00;">☀️ UV RADIATION:</strong>
            <span class="risk-level" style="color: ${uv.riskColor};">${uv.riskLevel}</span>
            <p class="main-message">${uv.message}</p>
            <p class="action-advice" style="color: ${uv.adviceColor};">${uv.action}</p>
        </div>

        <div class="insight-item">
            <strong style="color: #4CAF50;">💨 WIND & ACTIVITIES:</strong>
            <span class="risk-level" style="color: ${wind.riskColor};">${wind.riskLevel}</span>
            <p class="main-message">${wind.message}</p>
            <p class="action-advice" style="color: ${wind.adviceColor};">${wind.action}</p>
        </div>
    `;
}


// -------------------------------------------------------------------
// AQI Health Insight (Function rewritten for better messaging structure)
// -------------------------------------------------------------------
function getAqiInsight(aqiData) {
    if (!aqiData || !aqiData.hourly?.us_aqi) {
        return { riskLevel: 'N/A', message: 'Air quality data is unavailable.', action: 'No specific advice.', riskColor: 'gray', adviceColor: 'gray' };
    }

    // Use Today's average (index 0 for start day, 24 hours of data)
    const aqiValuesToday = aqiData.hourly.us_aqi.slice(0, 24);
    const aqiValue = Math.round(calculateDailyAverage(aqiValuesToday));
    const aqiInfo = getAqiLabel(aqiValue);
    
    let riskLevel = aqiInfo.label.toUpperCase();
    let message = '';
    let action = '';
    let riskColor = aqiInfo.color;
    let adviceColor = aqiInfo.titleColor;

    if (aqiValue >= 301) { // Hazardous
        message = `AQI **${aqiValue}** is **EXTREMELY DANGEROUS**. Severe health risk to all.`;
        action = `🚫 **CRITICAL: AVOID ALL OUTDOOR ACTIVITY**. Stay indoors, use air filtration.`;
    } else if (aqiValue >= 201) { // Very Unhealthy
        message = `AQI **${aqiValue}** poses a **SIGNIFICANT HEALTH RISK**.`;
        action = `🛑 **SENSITIVE GROUPS AVOID EXERTION**. Everyone else should limit prolonged outdoor activity.`;
    } else if (aqiValue >= 151) { // Unhealthy
        message = `AQI **${aqiValue}** is **UNHEALTHY**. Lung and heart effects are likely.`;
        action = `🚨 **AVOID EXERTION**: Sensitive groups **must** avoid outdoor activity. General public limit activity.`;
    } else if (aqiValue >= 101) { // Unhealthy for Sensitive Groups
        message = `AQI **${aqiValue}**. Respiratory issues may be aggravated.`;
        action = `⚠️ **CAUTION**: Sensitive individuals limit prolonged outdoor activity. Keep medication handy.`;
    } else if (aqiValue >= 51) { // Moderate
        message = `AQI **${aqiValue}** is generally acceptable.`;
        action = `☁️ **MONITOR**: Unusually sensitive individuals may consider slight activity reduction.`;
    } else { // Good
        message = `AQI **${aqiValue}** is satisfactory.`;
        action = `✅ **GO OUTSIDE**: Air quality is excellent. Enjoy the outdoors.`;
    }

    return { riskLevel, message, action, riskColor, adviceColor };
}

// -------------------------------------------------------------------
// UV Radiation Insight (Function rewritten for better messaging structure)
// -------------------------------------------------------------------
function getUvInsight(dailyData) {
    if (!dailyData || !dailyData.uv_index_max) {
        return { riskLevel: 'N/A', message: 'UV Index data is unavailable.', action: 'No specific advice.', riskColor: 'gray', adviceColor: 'gray' };
    }

    const maxUV = dailyData.uv_index_max[0];
    let riskLevel = '';
    let message = '';
    let action = '';
    let riskColor = '';
    let adviceColor = '';

    if (maxUV >= 11) { // Extreme
        riskLevel = 'EXTREME RISK';
        message = `Peak UV Index **${maxUV}**. **Unprotected skin burns in minutes**.`;
        action = `🔴 **CRITICAL**: **AVOID SUN 10 AM - 4 PM**. Use SPF 30+, full coverage, and seek deep shade.`;
        riskColor = 'red';
        adviceColor = 'red';
    } else if (maxUV >= 8) { // Very High
        riskLevel = 'VERY HIGH RISK';
        message = `Peak UV Index **${maxUV}**. **Protection is essential** to prevent skin damage.`;
        action = `🟠 **IMMEDIATE ACTION**: Use sunscreen, wear sunglasses and a wide-brimmed hat. Limit midday exposure.`;
        riskColor = '#FF8C00'; 
        adviceColor = '#FF8C00';
    } else if (maxUV >= 6) { // High
        riskLevel = 'HIGH RISK';
        message = `Peak UV Index **${maxUV}**. Protection is needed to prevent premature aging.`;
        action = `🟡 **PROTECTION NEEDED**: Apply sunscreen (SPF 15+). Reduce sun exposure during the brightest hours.`;
        riskColor = '#FFC107';
        adviceColor = '#FFC107';
    } else if (maxUV >= 3) { // Moderate
        riskLevel = 'MODERATE RISK';
        message = `Peak UV Index **${maxUV}**. Sun protection is recommended for long exposure.`;
        action = `🟢 **STANDARD CARE**: If spending over an hour outside, apply sunscreen.`;
        riskColor = '#4CAF50';
        adviceColor = '#4CAF50';
    } else { // Low
        riskLevel = 'LOW RISK';
        message = `Peak UV Index **${maxUV}**. Minimal risk.`;
        action = `🔵 **NO ACTION**: Sun protection is generally not necessary for short periods.`;
        riskColor = '#1E90FF';
        adviceColor = '#1E90FF';
    }

    return { riskLevel, message, action, riskColor, adviceColor };
}

// -------------------------------------------------------------------
// Wind Activity Insight (Function rewritten for better messaging structure)
// -------------------------------------------------------------------
function getWindActionInsight(hourlyData, unit) {
    if (!hourlyData || !hourlyData.windspeed_10m) {
        return { riskLevel: 'N/A', message: 'Wind data is unavailable.', action: 'No specific advice.', riskColor: 'gray', adviceColor: 'gray' };
    }

    // Get max wind speed (km/h) for the next 24 hours
    const next24HrWind = hourlyData.windspeed_10m.slice(24, 48).filter(val => val !== null);
    const maxWindKmH = next24HrWind.length > 0 ? Math.max(...next24HrWind) : 0;
    
    // Display max speed in user's unit
    const maxWindDisplay = convertSpeedToUnit(maxWindKmH, unit);
    const unitSymbol = unit === 'metric' ? 'km/h' : 'mph';
    
    let riskLevel = '';
    let message = '';
    let action = '';
    let riskColor = '';
    let adviceColor = '';

    if (maxWindKmH >= WIND_DANGER_KMH) {
        riskLevel = 'HIGH WIND HAZARD';
        message = `Max Wind Speed: **${maxWindDisplay}${unitSymbol}**. **Walking will be very difficult**.`;
        action = `⚠️ **SAFETY FIRST**: **Postpone all non-essential outdoor activities**. Secure loose objects.`;
        riskColor = 'red';
        adviceColor = 'red';
    } else if (maxWindKmH >= WIND_ADVISORY_KMH) {
        riskLevel = 'STRONG BREEZE ADVISORY';
        message = `Max Wind Speed: **${maxWindDisplay}${unitSymbol}**. Conditions are **uncomfortable for stationary activities** (dining, delicate work).`;
        action = `💨 **PLAN AROUND**: Good for wind sports; bad for drone flying. Expect physical exertion when walking against the wind.`;
        riskColor = '#FF8C00';
        adviceColor = '#FF8C00';
    } else if (maxWindKmH >= WIND_COMFORT_KMH) {
        riskLevel = 'MODERATE BREEZE';
        message = `Max Wind Speed: **${maxWindDisplay}${unitSymbol}**. Air is moving steadily.`;
        action = `🌬️ **ACTIVITY OPTIMAL**: Ideal wind for walking and cycling. Provides a pleasant cooling effect.`;
        riskColor = '#FFC107';
        adviceColor = '#4CAF50';
    } else {
        riskLevel = 'CALM/LIGHT AIR';
        message = `Max Wind Speed: **${maxWindDisplay}${unitSymbol}**. Air is still.`;
        action = `🌿 **CALM CONDITIONS**: Perfect for prolonged outdoor seating. **Monitor AQI**, as pollutants may not disperse well.`;
        riskColor = '#4CAF50';
        adviceColor = '#1E90FF';
    }

    return { riskLevel, message, action, riskColor, adviceColor };
}

// -------------------------------------------------------------------
// ORIGINAL ATMOSPHERE INSIGHT (Function rewritten for better messaging structure)
// -------------------------------------------------------------------

function getAtmosphereInsight(hourlyData, unit) {
    if (!hourlyData || !hourlyData.apparent_temperature || !hourlyData.dew_point_2m || !hourlyData.temperature_2m) {
        return { riskLevel: 'N/A', message: 'Comfort data unavailable.', action: 'No specific advice.', riskColor: 'gray', adviceColor: 'gray' };
    }

    // We focus on the peak period (afternoon) for the biggest impact
    const apparentTemps = hourlyData.apparent_temperature.slice(30, 42).filter(val => val !== null); 
    const dewPoints = hourlyData.dew_point_2m.slice(30, 42).filter(val => val !== null);
    const temperatures = hourlyData.temperature_2m.slice(30, 42).filter(val => val !== null);
    
    // VPD for dryness check (kPa)
    const vpd = hourlyData.vapour_pressure_deficit.slice(30, 42).filter(val => val !== null);
    const maxVPDStr = findMaxValue(vpd); 

    // Get the averaged and max values
    const avgDewPointStr = calculateDailyAverage(dewPoints);
    const maxApparentStr = findMaxValue(apparentTemps);
    const maxTempStr = findMaxValue(temperatures); // Max actual temperature for reference

    // Check if essential data is available
    const isDataValid = avgDewPointStr !== 'N/A' && maxApparentStr !== 'N/A' && maxTempStr !== 'N/A' && maxVPDStr !== 'N/A';
    
    if (!isDataValid) {
        return { riskLevel: 'N/A', message: 'Insufficient data for comfort analysis.', action: 'Check temperature and humidity sources.', riskColor: 'gray', adviceColor: 'gray' };
    }
    
    // Convert to number for strict comparison (using parseFloat) and ensure metric for thresholds
    const maxApparentC = parseFloat(convertTempToUnit(maxApparentStr, 'metric'));
    // Apply city acclimatization offset
    const avgDewPointC = parseFloat(convertTempToUnit(avgDewPointStr, 'metric')) + CITY_ACCLIMATIZATION;
    const maxTempC = parseFloat(convertTempToUnit(maxTempStr, 'metric'));
    const maxVPD = parseFloat(maxVPDStr);

    // Re-format for display (using user's chosen unit)
    const appMax = convertTempToUnit(maxApparentStr, unit);
    const dpAvg = convertTempToUnit(avgDewPointStr, unit); 
    const tempMax = convertTempToUnit(maxTempStr, unit);
    const tempUnit = unit === 'metric' ? '°C' : '°F';
    
    let riskLevel = '';
    let message = '';
    let action = '';
    let riskColor = '';
    let adviceColor = '';
    
    // --- Detailed Analysis (Metric thresholds based on NWS and WHO guidelines) ---
    
    // 1. DANGER ZONE (Highest Risk based on Heat Index)
    if (maxApparentC >= DANGER_HEAT_INDEX_C) {
        riskLevel = 'DANGER';
        message = `The "Feels Like" peak is **${appMax}${tempUnit}**. Heat stroke is possible.`;
        action = '🚫 **CRITICAL WARNING**: **Avoid all exertion** and direct sun. Seek AC immediately and stay hydrated.';
        riskColor = 'red';
        adviceColor = 'red';
    } 
    // 2. CAUTION ZONE (Moderate to High Risk based on Heat Index)
    else if (maxApparentC >= MODERATE_HEAT_INDEX_C) {
        riskLevel = 'HIGH HEAT STRESS';
        message = `The "Feels Like" peak is **${appMax}${tempUnit}**. Tropical Dew Point (${dpAvg}${tempUnit}) hinders sweat evaporation.`;
        action = `⚠️ **HEAT ADVISORY**: Limit exertion during peak heat hours. Take frequent breaks in the shade and ensure continuous hydration.`;
        riskColor = '#FF8C00';
        adviceColor = '#FF8C00';
    }
    // 3. OPPRESSIVE (High Moisture, Lower Heat Index)
    else if (avgDewPointC >= OPPRESSIVE_DP_C) {
        riskLevel = 'OPPRESSIVE';
        message = `The air is saturated (Dew Point: **${dpAvg}${tempUnit}**). Visibility may be low (fog/mist).`;
        action = '💧 **MOLD RISK**: High moisture aggravates asthma and mold growth. Use AC/dehumidifiers indoors. Expect sticky feeling outdoors.';
        riskColor = '#FF8C00';
        adviceColor = '#1E90FF';
    }
    // 4. MUGGY/STICKY (Moderate Moisture)
    else if (avgDewPointC >= MUGGY_DP_C) {
        riskLevel = 'MUGGY/STICKY';
        message = `The moisture content (Dew Point: **${dpAvg}${tempUnit}**) makes the air feel sticky.`;
        action = '🚶 **GENERAL CAUTION**: Light physical activity is fine, but fatigue is possible. Expect dew/fog formation overnight.';
        riskColor = '#FFC107';
        adviceColor = '#4CAF50';
    }
    // 5. PLEASANT/COMFORTABLE (Low Heat Index, Mid Dew Point)
    else if (avgDewPointC >= DRY_AIR_RISK_DP_C) {
        riskLevel = 'IDEAL COMFORT';
        message = `Excellent day! Max temp is ${tempMax}${tempUnit} with comfortable moisture (**${dpAvg}${tempUnit}**).`;
        action = '✅ **OPTIMAL DAY**: Enjoy the outdoors! Standard sun protection and hydration apply.';
        riskColor = '#4CAF50';
        adviceColor = '#4CAF50';
    }
    // 6. VERY DRY (Low Dew Point)
    else {
        riskLevel = 'VERY DRY';
        message = `The air is aggressively dry (Dew Point: **${dpAvg}${tempUnit}**). Max air temp is ${tempMax}${tempUnit}.`;
        
        if (maxVPD > 2.0) {
            action = `⚠️ **DEHYDRATION/VPD RISK**: High Vapor Pressure Deficit (${maxVPD.toFixed(1)} kPa) aggressively pulls moisture. **Increase water intake immediately**. Plants need irrigation.`;
            riskColor = '#FF8C00';
            adviceColor = '#FF8C00';
        } else {
             action = '💧 **DRYNESS RISK**: Expect dry skin, chapped lips, and static electricity. Focus on moisturizing and hydration.';
             riskColor = '#FFC107';
             adviceColor = '#FFC107';
        }
    }
    
    return { riskLevel, message, action, riskColor, adviceColor };
}


// NEW: Render Marine Insight
function renderMarineInsight(hourlyData, unit) {
    if (!hourlyData || !hourlyData.significant_wave_height || !hourlyData.sea_surface_temperature) {
        return { riskLevel: 'N/A', message: 'Marine data unavailable.', action: 'No specific advice.', riskColor: 'gray', adviceColor: 'gray' };
    }

    // Focus on today's data
    const waveHeights = hourlyData.significant_wave_height.slice(24, 48).filter(val => val !== null);
    const maxWaveHeightM = waveHeights.length > 0 ? Math.max(...waveHeights) : 'N/A';
    const sst = hourlyData.sea_surface_temperature.slice(24, 48).filter(val => val !== null);
    const avgSstC = calculateDailyAverage(sst);
    
    if (maxWaveHeightM === 'N/A' || avgSstC === 'N/A') {
        return { riskLevel: 'N/A', message: 'Insufficient valid data for marine analysis.', action: 'Try a coastal location.', riskColor: 'gray', adviceColor: 'gray' };
    }

    const maxWaveHeight = convertLengthToUnit(maxWaveHeightM, unit);
    const heightUnit = unit === 'metric' ? 'm' : 'ft';
    const avgSst = convertTempToUnit(avgSstC, unit);
    const tempUnit = unit === 'metric' ? '°C' : '°F';

    let riskLevel = '';
    let message = '';
    let action = '';
    let riskColor = '';
    let adviceColor = '';

    // Combined Marine Condition Analysis
    if (maxWaveHeightM >= WAVE_HEIGHT_ROUGH_M) {
        riskLevel = 'ROUGH SEAS';
        message = `Max wave height: **${maxWaveHeight}${heightUnit}**. Dangerous for boating.`;
        action = '🌊 **STAY ASHORE**: Avoid water activities, monitor tides.';
        riskColor = '#FF4500';
        adviceColor = '#FF4500';
    } else if (maxWaveHeightM >= WAVE_HEIGHT_MODERATE_M) {
        riskLevel = 'MODERATE WAVES';
        message = `Max wave height: **${maxWaveHeight}${heightUnit}**. Choppy conditions.`;
        action = '⚠️ **CAUTION**: Experienced swimmers only, secure vessels.';
        riskColor = '#FFC107';
        adviceColor = '#FFC107';
    } else if (parseFloat(avgSstC) < SST_COLD_C) {
        riskLevel = 'COLD WATER';
        message = `Average SST: **${avgSst}${tempUnit}**. Hypothermia risk.`;
        action = '❄️ **WETSUIT REQUIRED**: Limit immersion time.';
        riskColor = '#1E90FF';
        adviceColor = '#1E90FF';
    } else if (parseFloat(avgSstC) > SST_WARM_C) {
        riskLevel = 'WARM WATER';
        message = `Average SST: **${avgSst}${tempUnit}**. Comfortable but watch for bacteria.`;
        action = '🏊 **ENJOY**: Ideal for swimming, stay hydrated.';
        riskColor = '#4CAF50';
        adviceColor = '#4CAF50';
    } else {
        riskLevel = 'CALM SEAS';
        message = `Conditions ideal: Waves **${maxWaveHeight}${heightUnit}**, SST **${avgSst}${tempUnit}**.`;
        action = '🛥️ **GO BOATING**: Perfect for water sports.';
        riskColor = '#00CED1';
        adviceColor = '#00CED1';
    }

    return { riskLevel, message, action, riskColor, adviceColor };
}

// -------------------------------------------------------------------
// INSIGHT GENERATION FUNCTIONS (Mostly unchanged from previous response)
// -------------------------------------------------------------------

function renderGroundLevelInsight(hourlyData, unit) {
    const insightElement = document.getElementById('ground-level-dynamic-insight');
    const recommendationElement = document.getElementById('ground-level-recommendation');
    if (!insightElement || !recommendationElement || !hourlyData || !hourlyData.temperature_2m) return;

    const todayTemps = hourlyData.temperature_2m.slice(24, 48).filter(val => val !== null);
    const dailyAvgC = todayTemps.length > 0 ? (todayTemps.reduce((a, b) => a + b) / todayTemps.length) : null;
    
    const maxToday = todayTemps.length > 0 ? Math.max(...todayTemps) : 'N/A';
    const minToday = todayTemps.length > 0 ? Math.min(...todayTemps) : 'N/A';
    const swingTodayC = (maxToday !== 'N/A' && minToday !== 'N/A') ? (maxToday - minToday) : 'N/A';

    const { peakValue, peakTime } = findPeakData(hourlyData.temperature_2m, hourlyData.time);
    
    const unitSymbol = unit === 'metric' ? '°C' : '°F';
    // FIX: Use simple toFixed for swing, as it's a difference in C/F scale anyway
    const swingToday = swingTodayC !== 'N/A' ? parseFloat(swingTodayC).toFixed(1) : 'N/A';

    const normalAvg = convertTempToUnit(NORMAL_TEMP_DAILY_AVG_C, unit);
    const normalSwing = NORMAL_TEMP_SWING_C.toFixed(1);
    
    let avgComparison = '';
    let swingComparison = ''; // Added to initialize
    let recommendation = 'No specific action is needed beyond general comfort planning.';
    let isExtreme = false;
    
    // FIX: Define unitUnit variable locally to fix ReferenceError
    const unitUnit = unit === 'metric' ? '°C' : '°F';

    if (dailyAvgC !== null) {
        const diff = dailyAvgC - NORMAL_TEMP_DAILY_AVG_C;
        // FIX: Ensure conversion result is treated as a string for display only
        const diffUnit = convertTempToUnit(Math.abs(diff), unit).replace('°C', '').replace('°F', '');
        
        if (diff > 2.0) {
            // FIX: Use defined unitUnit variable
            avgComparison = `Significantly **warmer** than the historical average (${normalAvg}${unitSymbol}) by +${diffUnit}${unitUnit}.`;
            recommendation = '⚠️ **Heat Advisory**: Stay hydrated, avoid prolonged sun exposure, and plan outdoor activities for early morning.';
            isExtreme = true;
        } else if (diff < -2.0) {
            // FIX: Use defined unitUnit variable
            avgComparison = `Noticeably **cooler** than the historical average (${normalAvg}${unitSymbol}) by -${diffUnit}${unitUnit}.`;
            recommendation = '🧥 **Cool Weather Alert**: Dress in layers, especially if staying out after sundown.';
            isExtreme = true;
        } else {
            avgComparison = `Tracking **near the historical average** (${normalAvg}${unitSymbol}).`;
        }

        if (swingTodayC !== 'N/A') {
            const swingDiff = swingTodayC - NORMAL_TEMP_SWING_C;
            const swingDiffUnit = parseFloat(Math.abs(swingDiff)).toFixed(1);
            
            if (swingDiff > 2.0) {
                // FIX: Use defined unitUnit variable
                swingComparison = `The **temperature swing is wider** than normal (+${swingDiffUnit}${unitUnit} difference), indicating rapid cooling/heating.`;
                if (!isExtreme) recommendation = '🌤️ **Wide Swing**: Be prepared for significant temperature changes between morning and afternoon. Pack layers.';
            } else if (swingDiff < -2.0) {
                // FIX: Use defined unitUnit variable
                swingComparison = `The **temperature swing is narrower** than normal (-${swingDiffUnit}${unitUnit} difference), suggesting high humidity or persistent cloud cover.`;
                if (!isExtreme) recommendation = '☁️ **Narrow Swing**: Expect consistent temperatures. High humidity might make it feel warmer than the air temperature.';
            } else {
                swingComparison = `The daily temperature swing is **consistent** with normal conditions (${normalSwing}${unitSymbol}).`;
            }
        }
    }


    insightElement.innerHTML = `
        <div class="insight-line-1">
            <strong style="color:#ffcc00;">Average Temperature:</strong> ${calculateDailyAverage(todayTemps)}${unitSymbol}. 
            <span class="comparison-text">${avgComparison}</span>
        </div>
        <div class="insight-line-2">
            <strong style="color:#ffcc00;">Daily Swing:</strong> ${swingToday}${unitSymbol} (Peak at ${peakTime}). 
            <span class="comparison-text">${swingComparison}</span>
        </div>
    `;

    recommendationElement.innerHTML = recommendation;
}


function renderHumidityInsight(hourlyData, unit) {
    const insightElement = document.getElementById('desc-hourlyHumidityChart')?.querySelector('.chart-description-text');
    const recommendationElement = document.getElementById('humidity-recommendation');
    if (!insightElement || !recommendationElement || !hourlyData || !hourlyData.relative_humidity_2m) {
        recommendationElement.innerHTML = 'Moisture data is unavailable for analysis.';
        return;
    }

    const todayHumidity = hourlyData.relative_humidity_2m.slice(24, 48).filter(val => val !== null);
    const dailyAvg = todayHumidity.length > 0 ? (todayHumidity.reduce((a, b) => a + b) / todayHumidity.length) : null;

    // New: Dew Point and VPD for a richer insight
    const todayDewPoint = hourlyData.dew_point_2m.slice(24, 48).filter(val => val !== null);
    const dailyAvgDewPoint = todayDewPoint.length > 0 ? (todayDewPoint.reduce((a, b) => a + b) / todayDewPoint.length) : null;
    const dpUnitSymbol = unit === 'metric' ? '°C' : '°F';
    
    let avgComparison = '';
    let recommendation = 'Humidity is moderate, focus on general comfort.';
    let isExtreme = false;

    if (dailyAvg !== null) {
        const diff = dailyAvg - NORMAL_HUMIDITY_AVG_PERCENT;
        const diffAbs = Math.abs(diff).toFixed(1);
        
        if (diff > 10) {
            avgComparison = `Significantly **higher** than the normal average (${NORMAL_HUMIDITY_AVG_PERCENT}%) by +${diffAbs}%.`;
            recommendation = '💦 **High Humidity Alert**: Expect the air to feel heavy (higher "Feels Like" temperature). Take frequent breaks and stay cool. Monitor for mold risk indoors.';
            isExtreme = true;
        } else if (diff < -10) {
            avgComparison = `Noticeably **lower** than the normal average (${NORMAL_HUMIDITY_AVG_PERCENT}%) by -${diffAbs}%.`;
            recommendation = '🌵 **Low Humidity Warning**: Low moisture increases risk of dehydration and dry skin. Drink plenty of water and use moisturizers.';
            isExtreme = true;
        } else {
            avgComparison = `Tracking **near the historical average** (${NORMAL_HUMIDITY_AVG_PERCENT}%).`;
        }
    }

    // Since the original HTML block was primarily descriptive, we'll append a dynamic insight for the graph as well.
    // The main insight (avg comparison) will be placed inside the chart-description-text for more context.
    insightElement.innerHTML = `
        <p>Relative humidity measures the amount of water vapor in the air as a percentage of the maximum amount the air can hold at that temperature। This directly affects human comfort, evaporation rates, and dew point risk।</p>
        <p>
            <strong style="color:#ffcc00;">• Average RH Today:</strong> ${dailyAvg.toFixed(1)}%. 
            <span class="comparison-text">${avgComparison}</span>
        </p>
        <p>
            <strong style="color:#ffcc00;">• Average Dew Point:</strong> ${convertTempToUnit(dailyAvgDewPoint, unit)}${dpUnitSymbol}. 
            (This indicates the true moisture level).
        </p>
    `;

    // CRITICAL: Set the recommendation text immediately
    recommendationElement.innerHTML = recommendation;
}


function renderWindInsight(hourlyData, unit) {
    const insightElement = document.getElementById('desc-hourlyWindChart10m')?.querySelector('.chart-description-text');
    const recommendationElement = document.getElementById('wind-recommendation');
    if (!insightElement || !recommendationElement || !hourlyData || !hourlyData.windspeed_10m) {
        recommendationElement.innerHTML = 'Wind speed data is unavailable for analysis.';
        return;
    }

    const todayWind = hourlyData.windspeed_10m.slice(24, 48).filter(val => val !== null);
    const dailyAvgKmH = todayWind.length > 0 ? (todayWind.reduce((a, b) => a + b) / todayWind.length) : null;
    
    let avgComparison = '';
    let recommendation = 'No specific action is needed beyond general comfort planning.'; // Default recommendation
    let isExtreme = false;

    const unitSymbol = unit === 'metric' ? 'km/h' : 'mph';
    const dailyAvg = convertSpeedToUnit(dailyAvgKmH, unit);
    const normalAvg = convertSpeedToUnit(NORMAL_WINDSPEED_AVG_KMH, unit);
    const maxWind = convertSpeedToUnit(Math.max(...todayWind), unit);

    if (dailyAvgKmH !== null) {
        const diff = dailyAvgKmH - NORMAL_WINDSPEED_AVG_KMH;
        const diffUnit = convertSpeedToUnit(Math.abs(diff), unit);
        
        if (diff > 15) { // Threshold for strong wind alert (e.g., >15 km/h above normal)
            avgComparison = `Significantly **higher** than the normal average (${normalAvg}${unitSymbol}) by +${diffUnit}${unitSymbol}.`;
            recommendation = '💨 **Strong Wind Advisory**: Secure loose objects, avoid high profile vehicles, and postpone drone/outdoor hobby activities.';
            isExtreme = true;
        } else if (diff < -5) { // Threshold for calm/stagnant air
            avgComparison = `Noticeably **calmer** than the normal average (${normalAvg}${unitSymbol}) by -${diffUnit}${unitSymbol}.`;
            recommendation = '🌬️ **Stagnant Air Alert**: Very light winds may lead to poor dispersal of pollutants. Air quality may worsen, especially near traffic.';
            isExtreme = true;
        } else {
            avgComparison = `Tracking **near the historical average** (${normalAvg}${unitSymbol}).`;
            recommendation = '🍃 **Ideal Conditions**: Wind speeds are comfortable. Perfect for most outdoor activities including walking and cycling.';
        }
    }

    // Since the original HTML block was primarily descriptive, we'll append a dynamic insight for the graph as well.
    // The main insight (avg comparison) will be placed inside the chart-description-text for more context.
    insightElement.innerHTML = `
        <p>This graph compares wind speed at $10\text{m}$ (standard meteorological height) across three days to highlight daily trends and significant shifts in surface wind conditions।</p>
        <p>
            <strong style="color:#ffcc00;">• Average Wind Speed:</strong> ${dailyAvg}${unitSymbol}. 
            <span class="comparison-text">${avgComparison}</span>
        </p>
        <p>
            <strong style="color:#ffcc00;">• Max Gusts Expected:</strong> ${maxWind}${unitSymbol}.
        </p>
    `;

    // CRITICAL: Set the recommendation text immediately
    recommendationElement.innerHTML = recommendation;
}


// NEW: Render Marine Insight
function renderMarineInsight(hourlyData, unit) {
    if (!hourlyData || !hourlyData.significant_wave_height || !hourlyData.sea_surface_temperature) {
        return { riskLevel: 'N/A', message: 'Marine data unavailable.', action: 'No specific advice.', riskColor: 'gray', adviceColor: 'gray' };
    }

    // Focus on today's data
    const waveHeights = hourlyData.significant_wave_height.slice(24, 48).filter(val => val !== null);
    const maxWaveHeightM = waveHeights.length > 0 ? Math.max(...waveHeights) : 'N/A';
    const sst = hourlyData.sea_surface_temperature.slice(24, 48).filter(val => val !== null);
    const avgSstC = calculateDailyAverage(sst);
    
    if (maxWaveHeightM === 'N/A' || avgSstC === 'N/A') {
        return { riskLevel: 'N/A', message: 'Insufficient valid data for marine analysis.', action: 'Try a coastal location.', riskColor: 'gray', adviceColor: 'gray' };
    }

    const maxWaveHeight = convertLengthToUnit(maxWaveHeightM, unit);
    const heightUnit = unit === 'metric' ? 'm' : 'ft';
    const avgSst = convertTempToUnit(avgSstC, unit);
    const tempUnit = unit === 'metric' ? '°C' : '°F';

    let riskLevel = '';
    let message = '';
    let action = '';
    let riskColor = '';
    let adviceColor = '';

    // Combined Marine Condition Analysis
    if (maxWaveHeightM >= WAVE_HEIGHT_ROUGH_M) {
        riskLevel = 'ROUGH SEAS';
        message = `Max wave height: **${maxWaveHeight}${heightUnit}**. Dangerous for boating.`;
        action = '🌊 **STAY ASHORE**: Avoid water activities, monitor tides.';
        riskColor = '#FF4500';
        adviceColor = '#FF4500';
    } else if (maxWaveHeightM >= WAVE_HEIGHT_MODERATE_M) {
        riskLevel = 'MODERATE WAVES';
        message = `Max wave height: **${maxWaveHeight}${heightUnit}**. Choppy conditions.`;
        action = '⚠️ **CAUTION**: Experienced swimmers only, secure vessels.';
        riskColor = '#FFC107';
        adviceColor = '#FFC107';
    } else if (parseFloat(avgSstC) < SST_COLD_C) {
        riskLevel = 'COLD WATER';
        message = `Average SST: **${avgSst}${tempUnit}**. Hypothermia risk.`;
        action = '❄️ **WETSUIT REQUIRED**: Limit immersion time.';
        riskColor = '#1E90FF';
        adviceColor = '#1E90FF';
    } else if (parseFloat(avgSstC) > SST_WARM_C) {
        riskLevel = 'WARM WATER';
        message = `Average SST: **${avgSst}${tempUnit}**. Comfortable but watch for bacteria.`;
        action = '🏊 **ENJOY**: Ideal for swimming, stay hydrated.';
        riskColor = '#4CAF50';
        adviceColor = '#4CAF50';
    } else {
        riskLevel = 'CALM SEAS';
        message = `Conditions ideal: Waves **${maxWaveHeight}${heightUnit}**, SST **${avgSst}${tempUnit}**.`;
        action = '🛥️ **GO BOATING**: Perfect for water sports.';
        riskColor = '#00CED1';
        adviceColor = '#00CED1';
    }

    return { riskLevel, message, action, riskColor, adviceColor };
}

// -------------------------------------------------------------------
// CHART RENDERING FUNCTIONS
// -------------------------------------------------------------------

const chartInstances = {};

// Generic function to render comparison charts (Yesterday, Today, Tomorrow)
function renderComparisonChart(canvasId, dataKey, unit, options = {}) {
    const hourlyData = dataKey.includes('aqi') || dataKey.includes('monoxide') || dataKey.includes('dioxide') || dataKey.includes('ozone') || dataKey.includes('pm') ? dailyDataCache.aqiData.hourly : dailyDataCache.hourlyData;

    if (!hourlyData || !hourlyData.time || !hourlyData[dataKey]) {
        console.error(`${dataKey} data is missing for the chart.`);
        
        // Show a message in the chart container's parent
        const container = document.getElementById(canvasId).closest('.graph-container');
        if(container) {
             container.innerHTML = `<div class="error-message" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 15px; border-radius: 10px;">${options.chartTitle || dataKey} data is unavailable for this location.</div>`;
        }
        return;
    }

    // Define which sections should have hidden X-axis labels (based on user request)
    const HIDE_X_AXIS_LABELS = ['temperature_2m', 'temperature_80m', 'temperature_120m', 'temperature_180m'];
    const hideLabels = HIDE_X_AXIS_LABELS.includes(dataKey);


    // Use hourlyData.time for non-AQI. AQI uses a different time array (index 0 for start day, index 24 for tomorrow start)
    const timeData = hourlyData.time;
    
    const labels = timeData.slice(0, 72).map(time => {
        const d = new Date(time);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    });

    const rawData = hourlyData[dataKey] ? hourlyData[dataKey] : [];
    let processedData = rawData.map(val => val !== null ? parseFloat(val) : null);

    // Apply unit conversions if needed
    if (dataKey.includes('temperature') || dataKey === 'dew_point_2m' || dataKey === 'sea_surface_temperature') {
        processedData = processedData.map(val => convertTempToUnit(val, unit));
    } else if (dataKey.includes('windspeed')) {
        processedData = processedData.map(val => convertSpeedToUnit(val, unit));
    } else if (options.isLength) { // For wave height
        processedData = processedData.map(val => convertLengthToUnit(val, unit));
    }

    // Determine the start indices for data slicing
    const isThreeDay = hourlyData.time.length >= 72;
    // AQI and Cloud cover only use 48 hours of forecast data (Today & Tomorrow)
    const isAqiOrCloud = dataKey.includes('aqi') || dataKey.includes('monoxide') || dataKey.includes('dioxide') || dataKey.includes('ozone') || dataKey.includes('pm') || dataKey.includes('cloudcover');
    
    // For AQI/Cloud, we only show Today (index 0) and Tomorrow (index 24)
    const todayIndex = isAqiOrCloud ? 0 : 24;
    const tomorrowIndex = isAqiOrCloud ? 24 : 48;
    const yesterdayIndex = 0;

    const datasets = [];

    // Dataset 1: Yesterday (Only for non-AQI/Cloud, 3-day forecast)
    if(isThreeDay && !isAqiOrCloud) {
        datasets.push({
            label: 'Yesterday',
            data: processedData.slice(yesterdayIndex, yesterdayIndex + 24),
            borderColor: '#1E90FF',
            backgroundColor: 'rgba(30, 144, 255, 0.1)',
            fill: options.fillChart || false,
            borderWidth: 2,
            borderDash: [5, 5], // IMPROVEMENT: Dotted line for Yesterday
            tension: 0.4,
            pointRadius: 4, 
            pointHoverRadius: 6 
        });
    }

    // Dataset 2: Today
    datasets.push({
        label: 'Today',
        data: processedData.slice(todayIndex, tomorrowIndex),
        borderColor: options.dataColorToday || '#FFC107',
        backgroundColor: options.fillColorToday || 'rgba(255, 193, 7, 0.2)',
        fill: options.fillChart || false,
        borderWidth: 3, // IMPROVEMENT: Thicker line
        tension: 0.4,
        pointRadius: 4, // IMPROVEMENT
        pointHoverRadius: 6 // IMPROVEMENT
    });

    // Dataset 3: Tomorrow (if available)
    if (processedData.length > tomorrowIndex) {
        datasets.push({
            label: 'Tomorrow',
            data: processedData.slice(tomorrowIndex, tomorrowIndex + 24),
            borderColor: options.colorTomorrow || '#FF4500',
            backgroundColor: 'rgba(255, 69, 0, 0.2)',
            fill: options.fillChart || false,
            borderWidth: 2, // IMPROVEMENT: Slightly thinner line for forecast
            borderDash: [5, 5], // IMPROVEMENT: Dotted line for forecast
            tension: 0.4,
            pointRadius: 4, // IMPROVEMENT
            pointHoverRadius: 6 // IMPROVEMENT
        });
    }


    // Secondary Data Key (e.g., PM10)
    if (options.dataKey2) {
        const hourlyData2 = options.dataKey2.includes('aqi') || options.dataKey2.includes('monoxide') || options.dataKey2.includes('dioxide') || options.dataKey2.includes('ozone') || options.dataKey2.includes('pm') ? dailyDataCache.aqiData.hourly : dailyDataCache.hourlyData;
        const rawData2 = hourlyData2[options.dataKey2] ? hourlyData2[options.dataKey2] : [];
        let processedData2 = rawData2.map(val => val !== null ? parseFloat(val) : null);
        // Apply conversions
        if (options.dataKey2.includes('temperature')) {
            processedData2 = processedData2.map(val => convertTempToUnit(val, unit));
        } else if (options.dataKey2.includes('moisture')) {
            // No conversion for moisture %
        }
        
        // Secondary data only shows Today's forecast
        datasets.push({
            label: options.label2 || options.dataKey2,
            data: processedData2.slice(todayIndex, tomorrowIndex), 
            borderColor: options.color2 || '#D2B48C',
            backgroundColor: options.fillColor2 || `${options.color2 || '#D2B48C'}33`,
            fill: options.fillChart2 || false, 
            borderWidth: 3, // IMPROVEMENT
            tension: 0.4,
            pointRadius: 4, // IMPROVEMENT
            pointHoverRadius: 6 // IMPROVEMENT
        });
    }

    const unitLabel = options.unitLabel || (dataKey.includes('temperature') || dataKey === 'dew_point_2m' ? ` °${unit === 'metric' ? 'C' : 'F'}` : dataKey.includes('windspeed') ? ` ${unit === 'metric' ? 'km/h' : 'mph'}` : dataKey.includes('radiation') ? ' W/m²' : dataKey.includes('moisture') || dataKey.includes('cloudcover') ? ' %' : dataKey === 'us_aqi' ? '' : ' µg/m³');
    const yAxisLabel = options.yAxisLabel || `${options.chartTitle || dataKey.replace(/_/g, ' ').toUpperCase()}${unitLabel}`;

    const ctx = document.getElementById(canvasId);
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.slice(todayIndex, tomorrowIndex), // Use 24-hour labels
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    right: 15,
                    bottom: 0,
                    left: 0
                }
            },
            scales: {
                x: {
                    title: {
                        display: false,
                        // IMPROVEMENT: Increased contrast
                        color: '#E0E0E0' 
                    },
                    ticks: {
                        // FIX: Hide labels completely if requested (for temperature section)
                        display: !hideLabels, 
                        callback: function(value, index, values) {
                            if (hideLabels) return ''; // Explicitly return empty string if hiding
                            
                            // Otherwise, show every 2 hours
                            if (index % 2 === 0) { 
                                return this.getLabelForValue(value).split(' ')[0];
                            }
                            return '';
                        },
                        // IMPROVEMENT: Increased contrast and slightly larger font
                        color: '#E0E0E0', 
                        font: { size: 11 } 
                    },
                    grid: {
                        // IMPROVEMENT: Slightly darker, thinner grid lines
                        color: 'rgba(255, 255, 255, 0.15)' 
                    }
                },
                y: {
                    min: (dataKey === 'shortwave_radiation' || dataKey === 'direct_radiation' || dataKey.includes('moisture') || dataKey.includes('cloudcover') || isAqiOrCloud) ? 0 : undefined,
                    max: dataKey.includes('moisture') || dataKey.includes('cloudcover') ? 100 : dataKey === 'us_aqi' ? 500 : undefined,
                    title: {
                        display: true,
                        text: yAxisLabel, 
                        // IMPROVEMENT: Increased contrast
                        color: '#E0E0E0'
                    },
                    ticks: {
                        // IMPROVEMENT: Increased contrast
                        color: '#E0E0E0'
                    },
                    grid: {
                        display: true, 
                        // IMPROVEMENT: Slightly darker, thinner grid lines
                        color: 'rgba(255, 255, 255, 0.15)' 
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        // IMPROVEMENT: Increased contrast
                        color: '#E0E0E0', 
                        font: { size: 12 },
                        boxWidth: 10,
                        padding: 20
                    }
                },
                tooltip: {
                    // IMPROVEMENT: Tooltip background opacity increased for context visibility
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', 
                    titleColor: '#FFC107',
                    bodyColor: '#E0E0E0',
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += `${context.parsed.y.toFixed(1)}${unitLabel}`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderAllHourlyTempCharts(hourlyData, unit) {
    if (!hourlyData || !hourlyData.time) {
        console.error("Hourly data is missing for the charts.");
        return;
    }
    
    // RENDER TEMPERATURE CHARTS
    renderGroundLevelInsight(hourlyData, unit); 
    // The following calls will now render with hidden X-axis labels due to the fix in renderComparisonChart
    renderComparisonChart('hourlyTempChart', 'temperature_2m', unit, { chartTitle: 'Temperature (2m)' });
    renderComparisonChart('hourlyTempChart80m', 'temperature_80m', unit, { chartTitle: 'Temperature (80m)' });
    renderComparisonChart('hourlyTempChart120m', 'temperature_120m', unit, { chartTitle: 'Temperature (120m)' });
    renderComparisonChart('hourlyTempChart180m', 'temperature_180m', unit, { chartTitle: 'Temperature (180m)' });
}

// New: Function to render all humidity-related charts
function renderAllHumidityCharts(hourlyData, unit) {
    if (!hourlyData || !hourlyData.time) return;
    renderComparisonChart('hourlyHumidityChart', 'relative_humidity_2m', unit, { chartTitle: 'Relative Humidity', unitLabel: ' %' });
    renderComparisonChart('hourlyDewPointChart', 'dew_point_2m', unit, { chartTitle: 'Dew Point' });
    renderComparisonChart('hourlyVPDChart', 'vapour_pressure_deficit', 'metric', { chartTitle: 'Vapor Pressure Deficit', unitLabel: ' kPa' }); // VPD is always in kPa (metric)
    
    // CRITICAL FIX: Ensure insight is called to populate the recommendation text
    renderHumidityInsight(hourlyData, unit);
}

// MODIFIED: Renders the first wind chart as Y/T/T 10m comparison
function renderAllWindCharts(hourlyData, unit) {
    if (!hourlyData || !hourlyData.time) return;
    
    // CRITICAL FIX: Ensure insight is called to populate the recommendation text
    renderWindInsight(hourlyData, unit); // Keep the main wind insight/recommendation
    
    // Chart 1: The correct Y/T/T 10m Wind Speed comparison
    renderComparisonChart('hourlyWindChart10m', 'windspeed_10m', unit, { chartTitle: 'Wind Speed (10m)' });
    
    // Charts 2, 3, 4: Individual height charts (Yesterday/Today/Tomorrow comparison)
    renderComparisonChart('hourlyWindChart80m', 'windspeed_80m', unit, { chartTitle: 'Wind Speed (80m)' });
    renderComparisonChart('hourlyWindChart120m', 'windspeed_120m', unit, { chartTitle: 'Wind Speed (120m)' }); 
    renderComparisonChart('hourlyWindChart180m', 'windspeed_180m', unit, { chartTitle: 'Wind Speed (180m)' });
}


// -------------------------------------------------------------------
// NEW: AQI CHART RENDERING FUNCTIONS (Using real AQI data)
// -------------------------------------------------------------------
function renderAllAqiCharts(hourlyData, aqiData, unit) {
    const aqiContainer = document.getElementById('aqi-container');
    if (!aqiData || !aqiData.hourly || !aqiData.hourly.us_aqi) {
        aqiContainer.innerHTML = `<div class="error-message" style="padding: 20px;">Air Quality Index (AQI) data is unavailable for this location.</div>`;
        return;
    }
    
    // Insight (Uses real AQI data)
    const aqiInsight = getAqiInsight(aqiData);
    
    // Set dynamic HTML structure with charts and insights
    aqiContainer.innerHTML = `
        <div class="graph-container-wrapper">
            <div id="aqi-recommendation-box" style="width: 100%; margin-bottom: 20px;">
                <div class="graph-description-box" style="border: 2px solid ${aqiInsight.riskColor}; margin: 0; padding: 15px; min-height: auto;">
                    <div class="heading" style="color:${aqiInsight.riskColor}; border-bottom: 1px solid rgba(255, 255, 255, 0.2);">Today's Air Quality Summary</div>
                    <p style="margin: 0; font-size: 1.1em; font-weight: bold; color: #fff;">
                        ${aqiInsight.message.replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>')}
                    </p>
                    <p style="margin: 5px 0 0 0; font-size: 1em; font-weight: bold; color: ${aqiInsight.adviceColor};">
                        ${aqiInsight.action.replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>')}
                    </p>
                </div>
            </div>
            
            <hr class="section-divider">
            
            <div class="graph-container-item">
                <div class="graph-container" style="border-left: 5px solid #ffcc00;">
                    <h2>Hourly US AQI (Today & Tomorrow)</h2>
                    <canvas id="hourlyAqiChart"></canvas>
                </div>
                <div class="graph-description-box" style="border-right: 5px solid #ffcc00;">
                    <div class="heading" style="color: #ffcc00;">Health Risk Indicator</div>
                    <div class="chart-description-text">
                        <p>This graph forecasts the US AQI for the next 48 hours (Today and Tomorrow). The AQI indicates the health risk of air quality, where levels above 100 are considered unhealthy for sensitive groups.</p>
                        <p><strong style="color:#ff9933;">• Trend Analysis:</strong> High peaks in the line suggest when air pollution will be at its worst, often correlating with calm winds or rush hours.</p>
                    </div>
                </div>
            </div>
            
            <hr class="section-divider">
            
            <div class="graph-container-item">
                <div class="graph-container" style="border-left: 5px solid #4CAF50;">
                    <h2>Particulate Matter (PM2.5 vs PM10) ($\mu\text{g}/\text{m}^3$)</h2>
                    <canvas id="aqiPMChart"></canvas>
                </div>
                <div class="graph-description-box" style="border-right: 5px solid #4CAF50;">
                    <div class="heading" style="color: #4CAF50;">Respiratory & Lung Irritants</div>
                    <div class="chart-description-text">
                        <p>This graph tracks the hourly levels of two primary particulate pollutants: **PM2.5** (Green line), which can penetrate deep into the lungs, and **PM10** (Orange line), which affects the upper respiratory tract. The fill effect has been removed to clearly show the difference between the two pollutant sizes.</p>
                        <p><strong style="color:#4CAF50;">• PM10 Context:</strong> The PM10 line (Orange) is typically above the PM2.5 line (Green) since PM10 includes PM2.5 particles. The gap between the lines indicates the volume of coarser particles.</p>
                        <p><strong style="color:#4CAF50;">• Recommendation:</strong> Reduce outdoor exercise when PM levels are high and use air filtration indoors to mitigate exposure.</p>
                    </div>
                </div>
            </div>
            
            <hr class="section-divider">
            
            <div class="graph-container-item">
                <div class="graph-container" style="border-left: 5px solid #1E90FF;">
                    <h2>Gaseous Pollutants (Ozone & CO) ($\mu\text{g}/\text{m}^3$)</h2>
                    <canvas id="aqiGasChart"></canvas>
                </div>
                <div class="graph-description-box" id="desc-hourlyGasChart" style="border-right: 5px solid #1E90FF;">
                    <div class="heading" style="color: #1E90FF;">Chemical Hazards</div>
                    <div class="chart-description-text">
                        <p>This graph tracks the hourly levels of two hazardous gases: **Ozone ($\text{O}_3$)** (Blue line), which typically peaks during hot, sunny afternoons, and **Carbon Monoxide (CO)** (Orange line), which results directly from combustion sources like traffic.</p>
                        <p><strong style="color:#1E90FF;">• Ozone Risk:</strong> High Ozone reduces lung function. Avoid strenuous outdoor activity during peak $\text{O}_3$ hours (midday to late afternoon).</p>
                        <p><strong style="color:#1E90FF;">• CO Risk:</strong> High CO levels indicate traffic congestion or poor air mixing. Ensure proper ventilation indoors if high levels are forecasted.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Render charts (Note: AQI data is only Today and Tomorrow)
    renderComparisonChart('hourlyAqiChart', 'us_aqi', 'metric', { 
        chartTitle: 'US AQI', 
        dataColorToday: aqiInsight.riskColor, 
        fillChart: false // IMPROVEMENT: Fill removed for clarity
    });
    
    // PM chart - IMPROVEMENT: Fill removed for both PM2.5 and PM10 for less visual noise
    renderComparisonChart('aqiPMChart', 'pm2_5', 'metric', { 
        chartTitle: 'PM2.5', 
        yAxisLabel: 'PM µg/m³',
        unitLabel: ' µg/m³',
        dataColorToday: '#4CAF50',
        colorTomorrow: '#8BC34A',
        fillChart: false, // PM2.5 fill removed
        dataKey2: 'pm10',
        label2: `PM10 µg/m³`,
        color2: '#FFC107',
        fillChart2: false, // PM10 fill removed
    });

    // Gaseous Pollutants chart - IMPROVEMENT: Fill removed
    renderComparisonChart('aqiGasChart', 'ozone', 'metric', { 
        chartTitle: 'Ozone', 
        unitLabel: ' µg/m³',
        dataColorToday: '#1E90FF',
        colorTomorrow: '#00CED1',
        fillChart: false,
        dataKey2: 'carbon_monoxide',
        label2: `CO µg/m³`,
        color2: '#FF8C00',
        fillChart2: false
    });
}


// -------------------------------------------------------------------
// NEW: CLOUD COVER CHART RENDERING FUNCTIONS (Using real cloud data)
// -------------------------------------------------------------------
function renderAllCloudCharts(hourlyData, unit) {
    const cloudContainer = document.getElementById('cloud-cover-container');
    if (!hourlyData || !hourlyData.time || !hourlyData.cloudcover) {
        cloudContainer.innerHTML = `<div class="error-message" style="padding: 20px;">Cloud Cover data is unavailable for this location.</div>`;
        return;
    }
    
    // Calculate total average cloud cover today
    const totalCloudCover = hourlyData.cloudcover.slice(24, 48).filter(val => val !== null);
    const avgCloudCover = calculateDailyAverage(totalCloudCover);

    let cloudInsight = '';
    if (parseFloat(avgCloudCover) > 80) {
        cloudInsight = '☁️ **OVERCAST WARNING**: Expect a gray day with low illumination. Solar PV energy generation will be significantly reduced.';
    } else if (parseFloat(avgCloudCover) > 50) {
        cloudInsight = '🌥️ **PARTLY CLOUDY**: Intermittent sun and shade. Good for outdoor activities, but use sun protection during clear spells.';
    } else {
        cloudInsight = '☀️ **CLEAR SKY**: Minimal cloud cover is expected. High solar radiation and UV exposure are highly likely.';
    }

    // Set dynamic HTML structure with charts and insights
    cloudContainer.innerHTML = `
        <div class="graph-container-wrapper">
            <div id="cloud-recommendation-box" style="width: 100%; margin-bottom: 20px;">
                <div class="graph-description-box" style="border: 2px solid #D2B48C; margin: 0; padding: 15px; min-height: auto;">
                    <div class="heading" style="color:#D2B48C; border-bottom: 1px solid rgba(255, 255, 255, 0.2);">Today's Cloud Cover Summary</div>
                    <p style="margin: 0; font-size: 1.1em; font-weight: bold; color: #fff;">
                        Average Total Cloud Cover: **${parseFloat(avgCloudCover).toFixed(0)}%**.</p>
                    <p style="margin: 5px 0 0 0; font-size: 1em; font-weight: bold; color: #FFC107;">
                        ${cloudInsight.replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>')}
                    </p>
                </div>
            </div>
            
            <hr class="section-divider">
            
            <div class="graph-container-item">
                <div class="graph-container" style="border-left: 5px solid #9370DB;">
                    <h2>Total Cloud Cover (%) (Today & Tomorrow)</h2>
                    <canvas id="cloudCoverChart"></canvas>
                </div>
                <div class="graph-description-box" style="border-right: 5px solid #9370DB;">
                    <div class="heading" style="color: #9370DB;">Visibility and Illumination Effect</div>
                    <div class="chart-description-text">
                        <p>This graph measures the percentage of the sky obscured by clouds, critical for forecasting ambient light levels and solar power generation. Only the 48-hour forecast is displayed for clarity.</p>
                        <p><strong style="color:#9370DB;">• Low Cover (<50%):</strong> Expect a bright, clear day, maximizing solar energy potential.</p>
                        <p><strong style="color:#9370DB;">• High Cover (>80%):</strong> Expect a dim day with minimal direct sunlight, requiring artificial lighting.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Render chart (Total Cloud Cover)
    renderComparisonChart('cloudCoverChart', 'cloudcover', 'metric', {
        chartTitle: 'Total Cloud Cover',
        yAxisLabel: 'Cloud Cover (%)', 
        unitLabel: ' %',
        dataColorToday: '#9370DB', // Purple
        colorTomorrow: '#8A2BE2', // Blue Violet
        fillChart: 'origin'
    });
}


// NEW FUNCTION: Solar Radiation chart (Using real data)
function renderSolarRadiationCharts(hourlyData, unit) {
    // Note: This function now populates the container with id 'solar-radiation-container'
    const solarContainer = document.getElementById('solar-radiation-container');
    
    // Check 1: Ensure hourlyData exists and contains the radiation array
    if (!hourlyData || !hourlyData.direct_radiation || !hourlyData.shortwave_radiation) {
        solarContainer.innerHTML = `<div class="error-message" style="padding: 20px;">Solar Radiation data is unavailable for this location.</div>`;
        return;
    }
    
    // MODIFIED: Use the MAXIMUM Direct Radiation for today's forecast (indices 24 to 48)
    const directRadDataToday = hourlyData.direct_radiation.slice(24, 48);
    const maxDirectRad = directRadDataToday.length > 0 ? Math.max(...directRadDataToday.filter(val => val !== null)) : 0;

    // Fallback if maxDirectRad is negative or non-finite (shouldn't happen with direct_radiation but safety first)
    const currentGHI = isFinite(maxDirectRad) && maxDirectRad > 0 ? maxDirectRad : 0;
    
    // Determine the strength and color (logic remains correct)
    let strengthText = 'N/A';
    let strengthColor = '#6c757d'; 

    if (currentGHI < SOLAR_MEDIUM_WMSQ) {
        strengthText = 'MAX LOW / SCATTERED CLOUDS';
        strengthColor = '#4CAF50'; 
    } else if (currentGHI < SOLAR_HIGH_WMSQ) {
        strengthText = 'MAX MEDIUM / PARTIAL SUN';
        strengthColor = '#FFEB3B'; 
    } else if (currentGHI >= SOLAR_HIGH_WMSQ) {
        strengthText = 'MAX HIGH / FULL SUN POTENTIAL';
        strengthColor = '#FF5722'; 
    }

    // Calculate indicator position 
    const clampedGHI = Math.min(Math.max(currentGHI, 0), SOLAR_MAX_WMSQ);
    const indicatorPosition = (clampedGHI / SOLAR_MAX_WMSQ) * 100;
    
    // Apply position, adjusting for the indicator's own width (5px = half of the 10px width)
    const indicatorLeft = `calc(${indicatorPosition}% - 5px)`;
    
    // Build the HTML content for the solar section
    solarContainer.innerHTML = `
        <div class="graph-container-wrapper">
            
            <div class="graph-container-item">
                <div class="graph-container" style="border-left: 5px solid #FFA500;">
                    <h2>Global Horizontal Irradiance (GHI - W/m²)</h2>
                    <canvas id="hourlyGHIChart"></canvas>
                </div>
                <div class="graph-description-box" id="desc-hourlyGHIChart" style="border-right: 5px solid #FFA500;">
                    <div class="heading" style="color: #FFA500;">Solar Energy Output</div>
                    <div class="chart-description-text">
                        <p>This graph displays the **total shortwave solar radiation (GHI)** hitting a horizontal surface. It is the core metric for calculating solar power generation, accounting for clouds.</p>
                        <p><strong style="color:#FFC107;">• Peak Generation:</strong> The area under the curve is proportional to the total energy generated by flat solar panels (PV).</p>
                        <p><strong style="color:#FFC107;">• Cloud Impact:</strong> A jagged or suppressed line, compared to the expected smooth arc (clear sky), indicates **cloud cover** significantly reducing power output.</p>
                    </div>
                    <div class="heading recommendation-heading">Operational Recommendation</div>
                    <p class="dynamic-recommendation static-recommendation" style="border-left-color: #FFA500; background: rgba(255, 165, 0, 0.1);">
                        ☀️ **PV Systems**: Use the Today line to estimate daily output. Sudden dips mean energy is primarily coming from **battery reserves**.
                    </p>
                </div>
            </div>
            
            <hr class="section-divider">

            <div id="solar-strength-scale">
                <h3>☀️ Today's Direct Solar Peak (Max Direct Radiation)</h3>
                <div class="scale-track">
                    <div class="scale-indicator" id="scale-indicator" style="left: ${indicatorLeft}; background: ${strengthColor}; border-color: ${strengthColor};"></div>
                </div>
                <div class="scale-value-box" id="scale-value-box" style="background-color: ${strengthColor};">
                    ${currentGHI.toFixed(0)} W/m² - ${strengthText}
                </div>
                <div class="scale-label-container">
                    <span>LOW (0 W/m²)</span>
                    <span>MEDIUM (300 W/m²)</span>
                    <span>HIGH (600 W/m²)</span>
                    <span>MAX (1000 W/m²)</span>
                </div>
            </div>
            
            <hr class="section-divider">
            
            <div class="graph-container-item">
                <div class="graph-container" style="border-left: 5px solid #FFD700;">
                    <h2>Direct Solar Radiation (Direct Irradiance - W/m²)</h2>
                    <canvas id="hourlyDirectRadChart"></canvas>
                </div>
                <div class="graph-description-box" id="desc-hourlyDirectRadChart" style="border-right: 5px solid #FFD700;">
                    <div class="heading" style="color: #FFD700;">Focus for Solar Concentrators</div>
                    <div class="chart-description-text">
                        <p>This shows the solar energy arriving **directly from the sun** without atmospheric scattering. This is critical for any system using **focusing mirrors** or **solar tracking**.</p>
                        <p><strong style="color:#FFC107;">• Tracking System:</strong> A high direct value means solar trackers will be highly effective. A low direct value means power output is dominated by diffused light (less efficient).</p>
                    </div>
                    <div class="heading recommendation-heading">Prediction Insight</div>
                    <p class="dynamic-recommendation static-recommendation" style="border-left-color: #FFD700; background: rgba(255, 215, 0, 0.1);">
                        🌤️ **Clear Sky Check**: Compare the Direct Radiation trend to the GHI trend. If the GHI line is high but the Direct line is low, the sky is **bright but hazy/overcast**.
                    </p>
                </div>
            </div>
        </div>
    `;

    // Render the two new charts using the generic comparison function
    renderComparisonChart('hourlyGHIChart', 'shortwave_radiation', 'metric', { chartTitle: 'GHI', unitLabel: ' W/m²' });
    renderComparisonChart('hourlyDirectRadChart', 'direct_radiation', 'metric', { chartTitle: 'Direct Radiation', unitLabel: ' W/m²' });
}


// -------------------------------------------------------------------
// UPDATE UI/CLOCK
// -------------------------------------------------------------------

// Helper function (extracted from updateClockAndWeather for re-use)
function findCurrentDataIndex(hourlyData, timezone) {
    if (!hourlyData || !hourlyData.time) return 24; // Default to start of today's forecast if data is missing
    
    const now = new Date();
    
    // Calculate the current time in the target timezone, rounded down to the hour.
    // Use ISO string slicing to get the 'YYYY-MM-DDTHH:00' format for reliable comparison.
    try {
        const localISOHour = now.toLocaleString('en-US', { 
            timeZone: timezone, 
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false // Use 24-hour format for easier slicing
        }).replace(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/, '$3-$1-$2T$4:$5'); // Format to YYYY-MM-DDT HH:MM
        
        // Slice to get YYYY-MM-DDTHH (hour only)
        const targetTimePrefix = localISOHour.slice(0, 13); 
        
        // We search through the entire time array (yesterday, today, tomorrow)
        for (let i = 0; i < hourlyData.time.length; i++) {
            const dataTime = hourlyData.time[i].slice(0, 13); // Slice API data to YYYY-MM-DDTHH
            
            // Match the current hour
            if (dataTime === targetTimePrefix) {
                return i;
            }
        }
    } catch(e) {
        console.error("Error finding current data index using toLocaleString fallback:", e);
        // Fallback to searching based on UNIX timestamp if locale conversion fails
        const targetTimestamp = now.getTime() / 1000;
        
        for (let i = 0; i < hourlyData.time.length; i++) {
            const apiTimestamp = new Date(hourlyData.time[i]).getTime() / 1000;
            // The API data is hourly. Find the index where the API timestamp is the closest *past* or *current* hour.
            if (apiTimestamp > targetTimestamp) {
                // If the next hour is past the current time, return the previous hour's index
                return Math.max(24, i - 1); 
            }
        }
    }
    
    // Default to start of today's forecast (index 24)
    return 24;
}

function updateWeatherUI(city, daily, hourly, aqiData, unit) {
    
    // FIX 1: Calculate the correct index dynamically instead of hardcoding 25
    const currentHourIndex = findCurrentDataIndex(hourly, hourly.timezone); 

    const weatherCode = hourly.weathercode[currentHourIndex]; 
    let weatherCondition = convertWeatherCodeToCondition(weatherCode);
    
    toggleRainAnimation(weatherCondition);

    // FIX: Base time/date on the data point corresponding to the actual current local hour
    const initialTime = new Date(hourly.time[currentHourIndex]);
    const localDate = initialTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const localHour = initialTime.getHours();
    const isDayTime = localHour >= 6 && localHour < 18;
    
    setBodyBackground(city, weatherCondition, isDayTime);

    // Initial calls for all insights when data is loaded
    renderGroundLevelInsight(hourly, unit); 
    renderHumidityInsight(hourly, unit);
    renderWindInsight(hourly, unit);
    renderAllDashboardInsights(hourly, daily, aqiData, unit); 

    // FIX: Pass the calculated index to renderWeatherDisplay
    renderWeatherDisplay(city, daily, hourly, aqiData, unit, weatherCondition, localDate, initialTime.toLocaleTimeString(), isDayTime, currentHourIndex);
    renderForecastWindow(daily, unit);
}

async function setBodyBackground(city, weatherCondition, isDayTime) {
    let imageUrl = await fetchLandmarkImage(city, weatherCondition);

    if (!imageUrl) {
        imageUrl = getWeatherBackground(weatherCondition, isDayTime);
    }
    
    if (imageUrl) {
        try {
            // FIX: Don't remove the first quote in the slice
            const response = await fetch(imageUrl.slice(5, -2)); // Remove url(" and ")
            if (response.ok) {
                document.body.style.backgroundImage = imageUrl;
                document.body.style.backgroundColor = '';
                console.log("Background image loaded successfully.");
            } else {
                throw new Error("Failed to load image");
            }
        } catch (error) {
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundColor = '#1e1e1e';
            console.error("Failed to fetch background image:", error);
        }
    } else {
        document.body.style.backgroundImage = 'none';
        document.body.style.backgroundColor = '#1e1e1e';
    }
}

function updateClockAndWeather(city, timezone, weatherCondition, unit, dailyData, hourlyData, aqiData) {
    const weatherDisplay = document.getElementById('weather-display');
    let clockElement = weatherDisplay.querySelector('.clock');
    let lastHour = -1;

    if (intervalId) {
        clearInterval(intervalId);
    }

    intervalId = setInterval(() => {
        try {
            const now = new Date();
            const localDateStr = now.toLocaleString('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' });
            const localTimeStr = now.toLocaleString('en-US', { timeZone: timezone, hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // --- CRITICAL FIX 1: Use the helper function to find the current hour index ---
            let currentDataIndex = findCurrentDataIndex(hourlyData, timezone); 
            // --------------------------------------------------------------------------
            
            const currentHour = parseInt(now.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }));
            const isDayTime = currentHour >= 6 && currentHour < 18;

            if (clockElement) {
                clockElement.textContent = localTimeStr;
            }

            if (currentHour != lastHour) {
                
                const latestWeatherCode = hourlyData?.weathercode?.[currentDataIndex] || 0;
                const latestWeatherCondition = convertWeatherCodeToCondition(latestWeatherCode);

                setBodyBackground(city, latestWeatherCondition, isDayTime);
                // PASS THE CURRENT INDEX TO RENDER FUNCTION
                renderWeatherDisplay(city, dailyData, hourlyData, aqiData, unit, latestWeatherCondition, localDateStr, localTimeStr, isDayTime, currentDataIndex);
                renderForecastWindow(dailyData, unit);
                
                // Re-render all insights on the hour change
                renderGroundLevelInsight(hourlyData, unit);
                renderHumidityInsight(hourlyData, unit);
                renderWindInsight(hourlyData, unit);
                // NEW: Render combined atmosphere insight
                renderAllDashboardInsights(hourlyData, dailyData, aqiData, unit); 
                
                // NEW: Update other sections if visible
                const activeNav = document.querySelector('.main-nav .nav-link.active');
                if (activeNav) {
                    const targetId = activeNav.getAttribute('data-target');
                    switch(targetId) {
                        case 'hourly-temperature-container':
                            renderAllHourlyTempCharts(hourlyData, unit);
                            break;
                        case 'humidity-container':
                            renderAllHumidityCharts(hourlyData, unit);
                            break;
                        case 'wind-container':
                            renderAllWindCharts(hourlyData, unit);
                            break;
                        case 'solar-radiation-container': 
                            renderSolarRadiationCharts(hourlyData, unit);
                            break;
                        case 'aqi-container': 
                            renderAllAqiCharts(hourlyData, aqiData, unit);
                            break;
                        case 'cloud-cover-container': 
                            renderAllCloudCharts(hourlyData, unit);
                            break;
                    }
                }

                clockElement = weatherDisplay.querySelector('.clock');
                lastHour = currentHour;
            }
        } catch (error) {
            console.error("Error updating clock:", error);
            clearInterval(intervalId);
            intervalId = null;
        }
    }, 1000);
}

// --- CRITICAL FIX 2: Added currentDataIndex parameter and use it for current/apparent temp ---
function renderWeatherDisplay(city, daily, hourly, aqiData, unit, weatherCondition, localDate, localTime, isDayTime, currentDataIndex = 24) {
    const weatherDisplay = document.getElementById('weather-display');
    
    // Use the provided currentDataIndex (or default to start of today)
    const currentTemp = hourly?.temperature_2m?.[currentDataIndex];
    // Calculate daily average for 'Feels Like' since 'Feels Like' is often more useful as an average.
    const dailyAverageApparent = calculateDailyAverage(hourly?.apparent_temperature.slice(24, 48));

    const displayTemp = convertTempToUnit(currentTemp, unit) ?? 'N/A';
    const displayApparent = convertTempToUnit(dailyAverageApparent, unit) ?? 'N/A';
    const tempUnit = unit === 'metric' ? '°C' : '°F';
    
    // --- Display current temperature and average feels like ---
    weatherDisplay.innerHTML = `
        <div class="main-weather animate-fade-in">
            <h2 class="city-name">${city}</h2>
            <p class="date-time">${localDate} <span class="clock">${localTime}</span></p>
            <canvas id="main-weather-icon" width="60" height="60" class="weather-icon"></canvas>
            ${daily && hourly && aqiData ? `
                <div class="temperature">${displayTemp}${tempUnit}</div>
                <p class="feels-like">Feels like average ${displayApparent}${tempUnit} (Today)</p>
                <div class="data-grid">
                    ${generateDataCards(daily, hourly, aqiData, unit)}
                </div>
            ` : ''}
        </div>
    `;

    setAnimatedIcon('main-weather-icon', weatherCondition, isDayTime);
}

function renderForecastWindow(daily, unit) {
    const forecastGrid1 = document.getElementById('forecast-grid-1');
    const forecastGrid2 = document.getElementById('forecast-grid-2');
    const forecastWindow = document.getElementById('forecast-window');

    forecastWindow.style.display = 'block';

    let cardsHtml1 = '';
    let cardsHtml2 = '';
    const dailyData = daily?.time;

    if (dailyData && dailyData.length >= 10) {
        for (let i = 0; i < 5; i++) {
            const date = new Date(dailyData[i]);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const maxTemp = daily.temperature_2m_max[i]?.toFixed(0);
            const minTemp = daily.temperature_2m_min[i]?.toFixed(0);
            const humidity = daily.relative_humidity_2m_max[i]?.toFixed(0);
            const weatherCode = daily.weathercode[i];
            const iconId = `forecast-icon-${i}`;

            cardsHtml1 += `
                <div class="forecast-card">
                    <div class="forecast-date">${dayName}</div>
                    <canvas id="${iconId}" width="40" height="40" class="forecast-icon"></canvas>
                    <div class="forecast-temps">
                        <span class="max-temp">${maxTemp}${unit === 'metric' ? '°C' : '°F'}</span> / <span class="min-temp">${minTemp}${unit === 'metric' ? '°C' : '°F'}</span>
                    </div>
                    <div class="forecast-humidity">${humidity}% Hmd.</div>
                </div>
            `;
        }

        for (let i = 5; i < 10; i++) {
            const date = new Date(dailyData[i]);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const maxTemp = daily.temperature_2m_max[i]?.toFixed(0);
            const minTemp = daily.temperature_2m_min[i]?.toFixed(0);
            const humidity = daily.relative_humidity_2m_max[i]?.toFixed(0);
            const weatherCode = daily.weathercode[i];
            const iconId = `forecast-icon-${i}`;

            cardsHtml2 += `
                <div class="forecast-card">
                    <div class="forecast-date">${dayName}</div>
                    <canvas id="${iconId}" width="40" height="40" class="forecast-icon"></canvas>
                    <div class="forecast-temps">
                        <span class="max-temp">${maxTemp}${unit === 'metric' ? '°C' : '°F'}</span> / <span class="min-temp">${minTemp}${unit === 'metric' ? '°C' : '°F'}</span>
                    </div>
                    <div class="forecast-humidity">${humidity}% Hmd.</div>
                </div>
            `;
        }
    } else {
        cardsHtml1 = `<div class="error-message">Forecast data not available.</div>`;
        cardsHtml2 = '';
    }

    forecastGrid1.innerHTML = cardsHtml1;
    // FIX: Correct typo from cards2Html to cardsHtml2
    forecastGrid2.innerHTML = cardsHtml2;

    if (dailyData && dailyData.length >= 10) {
        for (let i = 0; i < 10; i++) {
            const weatherCode = daily.weathercode[i];
            const iconId = `forecast-icon-${i}`;
            const weatherCondition = convertWeatherCodeToCondition(weatherCode);
            setAnimatedIcon(iconId, weatherCondition);
        }
    }
}

function getAqiLabel(aqiValue) {
    if (aqiValue === 'N/A' || aqiValue === null) {
        return { label: 'Unavailable', color: 'gray' };
    }
    const aqi = parseFloat(aqiValue);
    if (aqi <= 50) {
        return { label: 'Good', color: '#00cc66', titleColor: '#004d26' }; // Green
    } else if (aqi <= 100) {
        return { label: 'Moderate', color: '#ffcc00', titleColor: '#665200' }; // Yellow
    } else if (aqi <= 150) {
        return { label: 'Unhealthy for Sensitive Groups', color: '#ff9933', titleColor: '#663d13' }; // Orange
    } else if (aqi <= 200) {
        return { label: 'Unhealthy', color: '#ff3333', titleColor: '#661313' }; // Red
    } else if (aqi <= 300) {
        return { label: 'Very Unhealthy', color: '#990099', titleColor: '#3d003d' }; // Purple
    } else {
        return { label: 'Hazardous', color: '#7e0023', titleColor: '#4f0016' }; // Maroon
    }
}

// ✅ MODIFIED: Added conditional coloring logic for various weather parameters
function generateDataCards(daily, hourly, aqiData, unit) {
    // Note: AQI data's hourly array is for Today/Tomorrow (48 hours), but array indices start from 0.
    const aqiValue = Math.round(calculateDailyAverage(aqiData.hourly?.us_aqi?.slice(0, 24)));
    const aqiInfo = getAqiLabel(aqiValue);
    
    const dpUnit = unit === 'metric' ? '°C' : '°F';
    const dpAvg = calculateDailyAverage(hourly?.dew_point_2m.slice(24, 48)); // Keep in metric for comparison to thresholds
    const dpAvgDisplay = convertTempToUnit(dpAvg, unit);
    
    const vpdAvg = calculateDailyAverage(hourly?.vapour_pressure_deficit.slice(24, 48));
    
    const todayPrecipitation = hourly?.precipitation?.slice(24, 48).filter(val => val != null).reduce((a, b) => a + b, 0).toFixed(1);
    
    const maxTempC = daily?.temperature_2m_max?.[0] ?? 'N/A'; // Keep in metric for comparison to thresholds
    const currentWindKmH = parseFloat(calculateDailyAverage(hourly?.windspeed_10m.slice(24, 48))); // Keep in metric for comparison to thresholds

    const currentHourIndex = 25; // First forecast hour
    const weatherCondition = convertWeatherCodeToCondition(hourly?.weathercode?.[currentHourIndex]);
    
    // --- COLOR LOGIC HELPER ---
    const getStyle = (title, valueMetric, valueDisplay) => {
        let color = null;
        let isBad = false;
        
        switch (title) {
            case 'Max Temp':
                // Max Temp thresholds in °C
                if (valueMetric >= 38) { color = 'rgba(255, 69, 0, 0.4)'; isBad = true; } // Extreme Heat
                else if (valueMetric >= 32) { color = 'rgba(255, 165, 0, 0.4)'; isBad = true; } // High Heat
                else if (valueMetric <= 10) { color = 'rgba(30, 144, 255, 0.4)'; } // Cool
                break;
            case 'Dew Point':
                // Dew Point thresholds in °C
                if (valueMetric >= 21) { color = 'rgba(147, 112, 219, 0.4)'; isBad = true; } // Oppressive
                else if (valueMetric >= 16) { color = 'rgba(100, 149, 237, 0.4)'; } // Muggy
                else if (valueMetric <= 10) { color = 'rgba(0, 191, 255, 0.4)'; } // Dry/Comfortable
                break;
            case 'Wind Speed':
                // Wind Speed thresholds in km/h
                if (valueMetric >= WIND_DANGER_KMH) { color = 'rgba(220, 20, 60, 0.4)'; isBad = true; } // Dangerous
                else if (valueMetric >= WIND_ADVISORY_KMH) { color = 'rgba(255, 140, 0, 0.4)'; isBad = true; } // Strong Advisory
                break;
            case 'Max UV':
                if (valueDisplay >= 8) { color = 'rgba(255, 69, 0, 0.4)'; isBad = true; } // Very High/Extreme
                else if (valueDisplay >= 6) { color = 'rgba(255, 165, 0, 0.4)'; isBad = true; } // High
                break;
            case 'US AQI':
                color = aqiInfo.color.replace('rgb(', 'rgba(').replace(')', ', 0.4)');
                isBad = aqiValue >= 101;
                break;
            case 'Precipitation':
                if (valueDisplay > 5) { color = 'rgba(0, 100, 0, 0.4)'; } // Significant Rain
                else if (valueDisplay > 0) { color = 'rgba(0, 128, 0, 0.4)'; } // Light Rain
                break;
        }

        if (color) {
            const borderColor = isBad ? color.replace('0.4)', '1)') : color.replace('0.4)', '0.7)');
            return `style="background: linear-gradient(to top right, rgba(0, 0, 0, 0.4), ${color}); border: 2px solid ${borderColor};"`;
        }
        return '';
    };

    const dataPoints = [
        { 
            title: 'Max Temp', 
            value: daily?.temperature_2m_max?.[0]?.toFixed(1) ?? 'N/A', 
            unit: unit === 'metric' ? '°C' : '°F', 
            icon: '⬆️', 
            extra: 'Peak today',
            metricValue: maxTempC
        },
        { 
            title: 'Min Temp', 
            value: daily?.temperature_2m_min?.[0]?.toFixed(1) ?? 'N/A', 
            unit: unit === 'metric' ? '°C' : '°F', 
            icon: '⬇️', 
            extra: 'Lowest today',
            metricValue: daily?.temperature_2m_min?.[0] ?? 'N/A'
        },
        { 
            title: 'Humidity', 
            value: calculateDailyAverage(hourly?.relative_humidity_2m.slice(24, 48)), 
            unit: '%', 
            icon: '💧', 
            extra: 'Average RH today',
            metricValue: calculateDailyAverage(hourly?.relative_humidity_2m.slice(24, 48))
        },
        { 
            title: 'Dew Point', 
            value: dpAvgDisplay, 
            unit: dpUnit, 
            icon: '🌡️', 
            extra: 'Absolute moisture level',
            metricValue: dpAvg
        },
        { 
            title: 'VPD', 
            value: vpdAvg, 
            unit: 'kPa', 
            icon: '🪴', 
            extra: 'Plant stress indicator',
            metricValue: vpdAvg
        },
        { 
            title: 'Wind Speed', 
            value: convertSpeedToUnit(currentWindKmH, unit), 
            unit: unit === 'metric' ? 'km/h' : 'mph', 
            icon: '💨', 
            extra: 'Average today',
            metricValue: currentWindKmH
        },
        { 
            title: 'Max UV', 
            value: daily?.uv_index_max?.[0]?.toFixed(0) ?? 'N/A', 
            unit: '', 
            icon: '☀️', 
            extra: 'Peak UV Index',
            metricValue: daily?.uv_index_max?.[0] ?? 'N/A'
        },
        { 
            title: 'US AQI', 
            value: aqiValue, 
            unit: '', 
            icon: '😷', 
            extra: `Air quality: ${aqiInfo.label}`,
            metricValue: aqiValue
        },
        {
            title: 'Precipitation',
            value: todayPrecipitation ?? 'N/A',
            unit: unit === 'metric' ? 'mm' : 'in',
            icon: '🌧️',
            extra: 'Total expected today',
            metricValue: todayPrecipitation
        },
        {
            title: 'Condition',
            value: weatherCondition.charAt(0).toUpperCase() + weatherCondition.slice(1),
            unit: '',
            icon: '☁️',
            extra: 'Current weather summary',
            metricValue: weatherCondition // Not numeric, just for completion
        }
    ];

    let cardsHtml = '';
    dataPoints.forEach(data => {
        if (data.value !== 'N/A') {
            const style = getStyle(data.title, parseFloat(data.metricValue), data.value);

            cardsHtml += `
                <div class="data-card" ${style} onmouseover="this.querySelector('.extra-info').style.display='block'" onmouseout="this.querySelector('.extra-info').style.display='none'">
                    <div class="card-icon">${data.icon}</div>
                    <div class="card-title">${data.title}</div>
                    <div class="card-value">${data.value}<span class="card-unit">${data.unit}</span></div>
                    <div class="extra-info">${data.extra}</div>
                </div>
            `;
        }
    });
    return cardsHtml;
}

function setAnimatedIcon(canvasId, weatherCondition, isDayTime = true) {
    const icons = new Skycons({ "color": "white" });
    const canvas = document.getElementById(canvasId);

    if (!canvas) return;

    let iconType;
    switch (weatherCondition) {
        case 'clear':
            iconType = isDayTime ? Skycons.CLEAR_DAY : Skycons.CLEAR_NIGHT;
            break;
        case 'cloudy':
            iconType = Skycons.CLOUDY;
            break;
        case 'rainy':
        case 'showers':
            iconType = Skycons.RAIN;
            break;
        case 'snowy':
            iconType = Skycons.SNOW;
            break;
        case 'thunderstorm':
            iconType = Skycons.WIND;
            break;
        case 'hazy':
            iconType = Skycons.FOG;
            break;
        default:
            iconType = isDayTime ? Skycons.CLEAR_DAY : Skycons.CLEAR_NIGHT;
    }

    icons.add(canvasId, iconType);
    icons.play();
}

function getWeatherBackground(weatherCondition, isDayTime) {
    const backgrounds = {
        'clear': {
            day: [
                'url("https://images.unsplash.com/photo-1534088950153-f7614e595359?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1472213981245-61e952314e1e?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1547842273-1950e30d7b38?q=80&w=2938&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1628882046465-983196884617?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1498450143891-9e73111f26a5?q=80&w=2940&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1519699047747-de8e3f22f41d?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534289381883-e18e3848b329?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2832&auto=format&fit=crop")'
            ]
        },
        'cloudy': {
            day: [
                'url("https://images.unsplash.com/photo-1493633633215-a6e54e4e9432?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1547043323-28952f411b0e?q=80&w=2826&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2938&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1521508215569-450f37ae03ba?q=80&w=2832&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1519699047747-de8e3f22f41d?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1447433875834-2e74a1882f1e?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2832&auto=format&fit=crop")',
            ]
        },
        'rainy': {
            day: [
                'url("https://images.unsplash.com/photo-1520626815349-db372d82959b?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1498845094269-04c954e7c7a5?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534088950153-f7614e595359?q=80&w=2942&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1498845094269-04c7a5?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2938&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534289381883-e18e3848b329?q=80&w=2832&auto=format&fit=crop")'
            ]
        },
        'snowy': {
            day: [
                'url("https://images.unsplash.com/photo-1529126242867-20b1716960b7?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1544378906-8d62b9a1e0b5?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1518349582522-a9b3d078e470?q=80&w=2940&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1519699047747-de8e3f22f41d?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1518349582522-a9b3d078e470?q=80&w=2940&auto=format&fit=crop")'
            ]
        },
        'showers': {
            day: [
                'url("https://images.unsplash.com/photo-1520626815349-db372d82959b?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1498845094269-04c7a5?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534088950153-f7614e595359?q=80&w=2942&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1498845094269-04c7a5?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2938&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534289381883-e18e3848b329?q=80&w=2832&auto=format&fit=crop")'
            ]
        },
        'thunderstorm': {
            day: [
                'url("https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1447433875834-2e74a1882f1e?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1558230554-46960d73801a?q=80&w=2940&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2832&auto=format&fit=fit=crop")',
                'url("https://images.unsplash.com/photo-1447433875834-2e74a1882f1e?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1558230554-46960d73801a?q=80&w=2940&auto=format&fit=crop")'
            ]
        },
        'hazy': {
            day: [
                'url("https://images.unsplash.com/photo-1522108785640-27f22c2357a5?q=80&w=2942&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534088950153-f7614e595359?q=80&w=2942&auto=format&fit=crop")'
            ],
            night: [
                'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2940&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1519699047747-de8e3f22f41d?q=80&w=2832&auto=format&fit=crop")',
                'url("https://images.unsplash.com/photo-1534289381883-e18e3848b329?q=80&w=2832&auto=format&fit=crop")'
            ]
        }
    };

    const getRandomBackground = (condition, isDay) => {
        const timeOfDay = isDay ? 'day' : 'night';
        const images = backgrounds[condition][timeOfDay] || backgrounds['clear'][timeOfDay];
        const randomUrl = images[Math.floor(Math.random() * images.length)];
        return randomUrl;
    };

    return getRandomBackground(weatherCondition, isDayTime);
}

function convertWeatherCodeToCondition(weatherCode) {
    if (weatherCode >= 0 && weatherCode <= 1) return 'clear';
    else if (weatherCode >= 2 && weatherCode <= 48) return 'cloudy';
    else if (weatherCode >= 51 && weatherCode <= 67) return 'rainy';
    else if (weatherCode >= 71 && weatherCode <= 77) return 'snowy';
    else if (weatherCode >= 80 && weatherCode <= 82) return 'showers';
    else if (weatherCode >= 95 && weatherCode <= 99) return 'thunderstorm';
    else return 'hazy';
}

function calculateDailyAverage(dataArray) {
    const validData = dataArray?.filter(val => val != null && isFinite(val));
    return validData?.length > 0 ? (validData.reduce((a, b) => a + b) / validData.length).toFixed(1) : 'N/A';
}

function findMaxValue(dataArray) {
    const validData = dataArray?.filter(val => val != null && isFinite(val));
    return validData?.length > 0 ? Math.max(...validData).toFixed(1) : 'N/A';
}