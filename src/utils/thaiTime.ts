/**
 * Thai Real-Time & Timezone Utility (เวลามาตรฐานประเทศไทย GMT+7 Asia/Bangkok)
 * Ensures accurate Thai date and time across all operating systems (iOS, Android, Windows, macOS, Linux)
 * irrespective of server container timezone or device clock setting.
 */

const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

let serverTimeOffsetMs = 0; // Difference between server and client clock

export function setServerTimeOffset(serverIso: string) {
  try {
    const serverMs = new Date(serverIso).getTime();
    const clientMs = Date.now();
    if (!isNaN(serverMs)) {
      serverTimeOffsetMs = serverMs - clientMs;
    }
  } catch (e) {
    console.warn('Failed to calculate server time offset', e);
  }
}

export function getNowWithOffset(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

export interface ThaiDateTimeResult {
  dateStr: string;         // YYYY-MM-DD in Asia/Bangkok
  timeStr: string;         // HH:mm:ss in Asia/Bangkok (24-hour)
  thaiYear: number;        // พ.ศ. (ค.ศ. + 543)
  dayName: string;         // เช่น วันศุกร์
  dayNum: number;          // 1-31
  monthNum: number;        // 1-12
  monthNameFull: string;   // เช่น ตุลาคม
  monthNameShort: string;  // เช่น ต.ค.
  fullThaiDate: string;    // เช่น วันศุกร์ที่ 10 ตุลาคม 2569
  formattedDateTime: string; // เช่น 10/10/2569 08:30:15 น.
  rawDate: Date;
}

export function getThaiDateTime(dateInput?: Date | string | number): ThaiDateTimeResult {
  let targetDate: Date;
  if (!dateInput) {
    targetDate = getNowWithOffset();
  } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
    targetDate = new Date(dateInput);
  } else {
    targetDate = dateInput;
  }

  if (isNaN(targetDate.getTime())) {
    targetDate = new Date();
  }

  let yearNum: number;
  let monthNum: number;
  let dayNum: number;
  let hourPadded: string;
  let minutePadded: string;
  let secondPadded: string;

  try {
    // Use Intl.DateTimeFormat strictly with Asia/Bangkok
    const thaiFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = thaiFormatter.formatToParts(targetDate);
    const partMap: Record<string, string> = {};
    parts.forEach((p) => {
      partMap[p.type] = p.value;
    });

    yearNum = parseInt(partMap.year || '', 10);
    monthNum = parseInt(partMap.month || '', 10);
    dayNum = parseInt(partMap.day || '', 10);

    if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
      throw new Error('Fallback to UTC+7 math');
    }

    let hour = partMap.hour || '0';
    if (hour === '24') hour = '00';
    hourPadded = String(hour).padStart(2, '0');
    minutePadded = String(partMap.minute || '0').padStart(2, '0');
    secondPadded = String(partMap.second || '0').padStart(2, '0');
  } catch {
    // Pure UTC+7 arithmetic fallback for older Android WebView / iOS Safari
    const bkkMs = targetDate.getTime() + 7 * 60 * 60 * 1000;
    const bkkDate = new Date(bkkMs);
    yearNum = bkkDate.getUTCFullYear();
    monthNum = bkkDate.getUTCMonth() + 1;
    dayNum = bkkDate.getUTCDate();
    hourPadded = String(bkkDate.getUTCHours()).padStart(2, '0');
    minutePadded = String(bkkDate.getUTCMinutes()).padStart(2, '0');
    secondPadded = String(bkkDate.getUTCSeconds()).padStart(2, '0');
  }

  const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  const timeStr = `${hourPadded}:${minutePadded}:${secondPadded}`;

  // Weekday in Thai computed deterministically via UTC calendar date (avoids iOS/Android toLocaleString bugs)
  const dayIndex = new Date(Date.UTC(yearNum, monthNum - 1, dayNum)).getUTCDay();
  const dayName = THAI_DAYS[dayIndex] || 'วัน';

  const thaiYear = yearNum + 543;
  const monthNameFull = THAI_MONTHS_FULL[monthNum - 1] || '';
  const monthNameShort = THAI_MONTHS_SHORT[monthNum - 1] || '';

  const fullThaiDate = `${dayName}ที่ ${dayNum} ${monthNameFull} ${thaiYear}`;
  const formattedDateTime = `${String(dayNum).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}/${thaiYear} ${timeStr} น.`;

  return {
    dateStr,
    timeStr,
    thaiYear,
    dayName,
    dayNum,
    monthNum,
    monthNameFull,
    monthNameShort,
    fullThaiDate,
    formattedDateTime,
    rawDate: targetDate,
  };
}

export function formatThaiDateOnly(dateStrYYYYMMDD: string): string {
  if (!dateStrYYYYMMDD) return '-';
  try {
    const [y, m, d] = dateStrYYYYMMDD.split('-').map(Number);
    if (!y || !m || !d) return dateStrYYYYMMDD;
    const thaiYear = y + 543;
    const monthShort = THAI_MONTHS_SHORT[m - 1] || '';
    return `${d} ${monthShort} ${thaiYear}`;
  } catch (e) {
    return dateStrYYYYMMDD;
  }
}
