# iiiaha_circuitee_exporter.rb
# Circuitee Light Exporter Extension for SketchUp

require 'sketchup.rb'
require 'extensions.rb'

module Iiiaha
  module CircuiteeExporter
    
    # Extension 정보
    PLUGIN_ID = 'iiiaha_circuitee_exporter'.freeze
    PLUGIN_NAME = 'iiiaha_circuitee_exporter'.freeze
    PLUGIN_VERSION = '1.0.0'.freeze
    
    # Extension 생성
    unless file_loaded?(__FILE__)
      ex = SketchupExtension.new(PLUGIN_NAME, 'iiiaha_circuitee_exporter/main.rb')
      ex.description = 'Export D5Render lights and switches to CSV for Circuitee'
      ex.version = PLUGIN_VERSION
      
      Sketchup.register_extension(ex, true)
      file_loaded(__FILE__)
    end
    
  end
end