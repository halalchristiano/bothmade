/**
 * Works out what time it is where a lead actually is, from their phone
 * number.
 *
 * The reps calling these leads are not in the same country as most of them.
 * A US lead rung at 09:00 UK time is being rung at 04:00 their time, which
 * burns the lead permanently — you don't get a second first call. Showing
 * their local time next to the dial button makes that mistake impossible to
 * make by accident.
 *
 * Derived from the area code rather than the address, because the phone
 * number is a real field while the address is folded into freeform notes.
 * Where the area code isn't recognised, nothing is shown — a wrong time is
 * worse than no time.
 */

/** North American area codes grouped by IANA zone. Split codes resolve to their dominant zone. */
const AREA_CODE_ZONES: Record<string, string> = {};

const assign = (zone: string, codes: string[]) => {
  for (const c of codes) AREA_CODE_ZONES[c] = zone;
};

// Eastern
assign('America/New_York', [
  '231','248','252','260','267','269','401','540',
  '201','202','203','207','212','215','216','220','223','227','229','234','239','240','246','272','276','278','289','301','302','304','305','313','315','321','326','330','331','332','336','339','343','345','347','351','352','354','363','364','365','367','380','386','404','407','410','412','413','414','416','419','423','434','437','438','440','443','445','447','450','458','463','464','470','475','478','484','508','513','514','516','517','518','519','527','534','539','551','561','567','570','571','579','581','585','586','587','603','606','607','609','610','612','613','614','615','616','617','623','628','629','631','636','646','647','667','678','680','681','686','689','704','705','706','709','716','717','718','724','727','732','734','737','740','743','754','757','762','765','770','772','773','774','779','781','782','786','787','802','803','804','810','812','813','814','815','816','819','828','829','831','838','839','843','845','848','849','850','856','857','858','859','860','862','863','864','865','872','873','876','878','904','905','906','908','910','912','914','915','917','919','929','930','931','937','938','939','941','943','945','947','949','954','959','973','978','980','984','986','989',
]);
// Central
assign('America/Chicago', [
  '210','219','308','317','325','334','531','574','605','731',
  '205','214','217','218','224','225','251','254','256','262','270','281','309','312','314','316','318','319','320','337','346','347','354','361','372','374','402','405','409','417','430','432','445','469','479','501','502','504','505','507','512','515','534','563','573','580','601','608','618','620','630','636','641','651','659','660','662','682','701','708','712','713','715','726','737','763','769','773','779','785','806','815','816','817','830','832','847','850','870','872','901','903','913','915','918','920','925','936','940','952','956','972','979','985',
]);
// Mountain
assign('America/Denver', [
  '208','303','307','385','406','435','505','575','719','720','801','915','970','983',
]);
assign('America/Phoenix', ['480', '520', '602', '623', '928']); // Arizona: no daylight saving
// Pacific
assign('America/Los_Angeles', [
  '725','775',
  '206','209','213','253','279','310','323','341','360','408','415','424','425','442','503','509','510','530','541','559','562','564','619','626','650','657','661','669','707','714','747','752','760','805','818','820','831','838','858','909','916','925','949','951','971',
]);
assign('America/Anchorage', ['907']);
assign('Pacific/Honolulu', ['808']);
// UK / Ireland
assign('Europe/London', ['44']);
assign('Europe/Dublin', ['353']);

/** Toll-free prefixes: reachable from anywhere, so they locate nothing. */
const TOLL_FREE = new Set(['800', '833', '844', '855', '866', '877', '888']);

export interface LeadLocalTime {
  zone: string | null;
  /** e.g. "3:42 PM" in their timezone. */
  time: string;
  hour: number;
  /** Whether now is a sensible moment to ring a business. */
  callability: 'good' | 'okay' | 'bad';
  advice: string;
}

/**
 * Returns the lead's local time, or null when the number isn't one we can
 * place. Non-North-American numbers fall back to their country dial code
 * where we know it.
 */
export function leadLocalTime(phone: string | null | undefined, now: Date = new Date()): LeadLocalTime | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;

  let zone: string | undefined;

  // +44... / +353... — country code before the national number.
  if (digits.startsWith('44') && digits.length >= 11) zone = AREA_CODE_ZONES['44'];
  else if (digits.startsWith('353')) zone = AREA_CODE_ZONES['353'];
  else {
    // North American: optional leading 1, then a 3-digit area code.
    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (national.length === 10) {
      const area = national.slice(0, 3);
      if (TOLL_FREE.has(area)) {
        return {
          zone: null,
          time: '',
          hour: -1,
          callability: 'okay',
          advice: "Toll-free number — it doesn't say where they are, so check before assuming the hour.",
        };
      }
      zone = AREA_CODE_ZONES[area];
    }
  }
  if (!zone) return null;

  let time: string;
  let hour: number;
  try {
    time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
    hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hour12: false }).format(now)
    );
  } catch {
    return null; // unknown zone on this runtime — say nothing rather than guess
  }
  if (Number.isNaN(hour)) return null;

  let callability: LeadLocalTime['callability'];
  let advice: string;
  if (hour >= 9 && hour < 11) {
    callability = 'good';
    advice = 'Good time to ring — mid-morning is the best window there is.';
  } else if (hour >= 13 && hour < 16) {
    callability = 'good';
    advice = 'Good time to ring — early afternoon, past lunch and before the end-of-day rush.';
  } else if (hour >= 8 && hour < 17) {
    callability = 'okay';
    advice =
      hour < 9
        ? 'Workable, but they may only just be in.'
        : hour < 13
          ? 'Workable — though they may be heading to lunch.'
          : 'Workable, but late afternoon people start winding down.';
  } else if (hour >= 17 && hour < 19) {
    callability = 'okay';
    advice = 'Late for an office, but often fine for a trade who is off site by now.';
  } else {
    callability = 'bad';
    advice =
      hour < 8
        ? "Too early — it's the middle of the night or first thing there. Ringing now wastes the lead."
        : "Too late — they've finished for the day. Ringing now wastes the lead.";
  }

  return { zone, time, hour, callability, advice };
}
