package kr.whenigo.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 화면이 만들어지기 전에 등록해야 웹에서 부를 수 있다
        registerPlugin(ClockAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
