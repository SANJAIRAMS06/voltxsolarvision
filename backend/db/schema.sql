CREATE DATABASE IF NOT EXISTS voltx
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE voltx;

CREATE TABLE IF NOT EXISTS generation_readings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reading_date DATE NOT NULL,
  expected_kwh DECIMAL(10, 2) NOT NULL,
  actual_kwh DECIMAL(10, 2) NOT NULL,
  capacity_kw DECIMAL(10, 2) NOT NULL,
  dust BOOLEAN NOT NULL DEFAULT FALSE,
  shade BOOLEAN NOT NULL DEFAULT FALSE,
  inverter BOOLEAN NOT NULL DEFAULT FALSE,
  wiring BOOLEAN NOT NULL DEFAULT FALSE,
  source VARCHAR(40) NOT NULL DEFAULT 'User',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_generation_readings_date (reading_date)
);

INSERT INTO generation_readings
  (reading_date, expected_kwh, actual_kwh, capacity_kw, dust, shade, inverter, wiring, source)
SELECT CURRENT_DATE, 20.00, 14.00, 10.00, TRUE, FALSE, FALSE, FALSE, 'Sample'
WHERE NOT EXISTS (SELECT 1 FROM generation_readings);
