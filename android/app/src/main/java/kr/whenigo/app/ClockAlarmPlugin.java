package kr.whenigo.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.AlarmClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 기기 시계 앱에 알람을 만든다.
 *
 * 이 앱이 웹보다 나은 유일한 점이다. 브라우저는 정해진 시각에 사람을 깨울
 * 방법이 없어서, 웹에서는 구글 캘린더에 일정을 넣어 캘린더 알림에 기댔다 —
 * 무음 모드면 안 울리고, 알림을 꺼둔 사람에게는 아무 일도 일어나지 않는다.
 * 시계 알람은 무음을 뚫고 울린다.
 *
 * ACTION_SET_ALARM 은 우리가 알람을 소유하지 않는다. 시계 앱에 "이 시각에
 * 하나 만들어 달라" 고 부탁하는 것이라, 우리 앱을 지워도 알람은 남고
 * 사용자가 시계 앱에서 직접 끄고 켤 수 있다. 우리가 백그라운드로 살아 있을
 * 필요도, 정확한 알람 권한(SCHEDULE_EXACT_ALARM)을 요구할 필요도 없다.
 */
@CapacitorPlugin(name = "ClockAlarm")
public class ClockAlarmPlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            call.reject("시각이 올바르지 않습니다", "bad-time");
            return;
        }

        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour)
            .putExtra(AlarmClock.EXTRA_MINUTES, minute)
            .putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("label", "출발"))
            /*
             * 확인 화면을 띄운다(SKIP_UI = false).
             *
             * 건너뛰면 누르자마자 알람이 생기는데, 사용자가 만든 기억이 없는
             * 알람이 새벽에 울린다. 시계 앱 화면을 한 번 보여주면 몇 시인지
             * 눈으로 확인하고 저장하게 된다 — 이 앱은 시각을 틀리면
             * 아무 쓸모가 없으므로 그 한 번이 값싸다.
             */
            .putExtra(AlarmClock.EXTRA_SKIP_UI, false);

        try {
            getActivity().startActivity(intent);
            JSObject out = new JSObject();
            out.put("opened", true);
            call.resolve(out);
        } catch (ActivityNotFoundException e) {
            // 시계 앱이 없는 기기가 드물게 있다. 거짓으로 성공을 알리지 않는다.
            call.reject("이 기기에서 알람을 만들 수 있는 시계 앱을 찾지 못했습니다", "no-clock-app");
        }
    }
}
