Pod::Spec.new do |s|
  s.name = 'AbsoluteDevicesCapacitor'
  s.version = '0.1.3'
  s.summary = 'Capacitor runtime adapter and secure credential vault for AbsoluteJS.'
  s.license = { :type => 'BSL-1.1', :file => 'LICENSE' }
  s.homepage = 'https://github.com/absolutejs/devices'
  s.author = 'Alex Kahn'
  s.source = { :git => 'https://github.com/absolutejs/devices.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
