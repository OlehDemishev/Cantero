Pod::Spec.new do |s|
  s.name           = 'OnDeviceOcr'
  s.version        = '0.1.0'
  s.summary        = 'On-device text recognition (Apple Vision) for Cantero Field'
  s.description    = 'Reads receipt text on the phone, with line positions, in German, English, Polish and Ukrainian.'
  s.license        = 'UNLICENSED'
  s.author         = 'Cantero'
  s.homepage       = 'https://cantero.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
