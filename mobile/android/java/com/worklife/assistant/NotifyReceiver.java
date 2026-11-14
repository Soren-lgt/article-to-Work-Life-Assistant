package com.worklife.assistant;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 计划提醒到点时由系统闹钟叫醒这里：直接往通知栏推一条。
 * 这一步不依赖网页，所以 App 关掉、没在前台也照样响。
 */
public class NotifyReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "chaomu-notice";
    public static final String ACTION = "com.worklife.assistant.REMIND";

    @Override
    public void onReceive(Context ctx, Intent it) {
        if (it == null) return;
        String id = it.getStringExtra("id");
        String title = it.getStringExtra("title");
        String body = it.getStringExtra("body");
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                b = new Notification.Builder(ctx, CHANNEL_ID);
            } else {
                b = new Notification.Builder(ctx);
            }
            Intent open = new Intent(ctx, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 2001, open, flags);
            String text = body == null ? "" : body;
            b.setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title == null || title.length() == 0 ? "计划提醒" : title)
                    .setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setShowWhen(true);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                b.setPriority(Notification.PRIORITY_HIGH);
            }
            String tag = "remind-" + (id == null || id.length() == 0 ? "plan" : id);
            nm.notify(tag, Math.abs(tag.hashCode()) % 100000, b.build());
        } catch (Exception ignored) { }
    }
}
