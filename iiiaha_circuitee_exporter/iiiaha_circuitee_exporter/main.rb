# main.rb
# Main loader for Circuitee Light Exporter

require 'sketchup.rb'

module Iiiaha
  module CircuiteeExporter
    
    # iiiaha 메뉴 통합
    if defined?(Iiiaha::Menu)
      require_relative 'iiiaha_menu_stub.rb'
    else
      # iiiaha 메뉴가 없으면 자체 버전 사용
      require_relative 'iiiaha_menu.rb'
    end
    
    # 핵심 기능 로드
    require_relative 'light_exporter.rb'
    
    # 메뉴 추가
    unless file_loaded?(__FILE__)
      menu = Iiiaha::Menu.iiiaha
      menu.add_item('Circuitee 조명 내보내기') { 
        Iiiaha::CircuiteeExporter::LightExporter.export_lights
      }
      
      # 툴바 생성
      toolbar = UI::Toolbar.new('Circuitee Exporter')
      
      # 커맨드 생성
      cmd = UI::Command.new('Export to Circuitee') { 
        Iiiaha::CircuiteeExporter::LightExporter.export_lights
      }
      cmd.small_icon = File.join(File.dirname(__FILE__), 'icon.png')
      cmd.large_icon = File.join(File.dirname(__FILE__), 'icon.png')
      cmd.tooltip = 'Circuitee 조명 내보내기'
      cmd.status_bar_text = 'D5Render 조명과 스위치를 CSV로 내보내기'
      
      toolbar = toolbar.add_item(cmd)
      toolbar.show
      
      file_loaded(__FILE__)
    end
    
  end
end