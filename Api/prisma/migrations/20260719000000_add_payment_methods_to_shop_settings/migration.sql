ALTER TABLE "ShopSetting"
ADD COLUMN "paymentMethods" TEXT NOT NULL DEFAULT '[{"id":"cod","name":"COD","type":"cod","active":true,"sortOrder":0},{"id":"cash","name":"Cash","type":"normal","active":true,"sortOrder":1},{"id":"kbz-pay","name":"KBZ Pay","type":"normal","active":true,"sortOrder":2}]';
