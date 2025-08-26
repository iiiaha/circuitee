# light_exporter.rb
# Core light export functionality

require 'sketchup.rb'

module Iiiaha
  module CircuiteeExporter
    module LightExporter
    
    # Helper method to recursively collect all component instances including those in groups
    def self.collect_instances_recursively(entities, parent_transformation, result_array)
      entities.each do |entity|
        if entity.is_a?(Sketchup::ComponentInstance)
          # Accumulate transformation
          accumulated_trans = parent_transformation * entity.transformation
          result_array << {instance: entity, transformation: accumulated_trans}
        elsif entity.is_a?(Sketchup::Group)
          # Recursively process group contents
          accumulated_trans = parent_transformation * entity.transformation
          collect_instances_recursively(entity.entities, accumulated_trans, result_array)
        end
      end
    end
    
    def self.export_lights
      model = Sketchup.active_model
      
      # Arrays to store data
      point_lights = []
      linear_lights = []
      switches = []
      
      # Debug: Check model units
      puts "\n=== Model Units Check ==="
      options = model.options["UnitsOptions"]
      puts "Length Unit: #{options["LengthUnit"]}"
      puts "Length Format: #{options["LengthFormat"]}"
      puts "Length Precision: #{options["LengthPrecision"]}"
      
      # Debug: List all definitions
      puts "\n=== Scanning for D5 Lights ==="
      puts "Total definitions in model: #{model.definitions.length}"
      
      # Recursively find all instances including those in groups
      all_instances = []
      collect_instances_recursively(model.entities, Geom::Transformation.new, all_instances)
      
      puts "Found #{all_instances.length} total instances (including nested)"
      
      # Process each instance with its accumulated transformation
      all_instances.each do |instance_data|
        instance = instance_data[:instance]
        global_trans = instance_data[:transformation]
        definition = instance.definition
        
        # Debug: Show definition names
        if definition.name.downcase.include?("d5") || definition.name.downcase.include?("light")
          puts "Found potential light: '#{definition.name}'"
        end
        
        # Check if this is a light component (includes numbered versions)
        if definition.name == "D5RenderLight.Spot" || definition.name.start_with?("D5RenderLight.Spot#")
          # Point light
          puts "  -> Processing Spot light (#{instance.parent.class})"
          
          # Get the center point of the component bounds in definition space
          def_bounds = definition.bounds
          center = def_bounds.center
          
          # Transform to global coordinates using accumulated transformation
          global_center = global_trans * center
          
          puts "    Global transformation applied"
          puts "    Definition center: (#{center.x.to_mm.round(2)}, #{center.y.to_mm.round(2)}, #{center.z.to_mm.round(2)}) mm"
          puts "    Global center: (#{global_center.x.to_mm.round(2)}, #{global_center.y.to_mm.round(2)}, #{global_center.z.to_mm.round(2)}) mm"
          
          # Convert to mm - SketchUp internal units are inches
          point_lights << {
            type: "point",
            x: global_center.x.to_mm,
            y: global_center.y.to_mm,
            z: global_center.z.to_mm,
            name: instance.name.empty? ? "Light_#{point_lights.length + 1}" : instance.name
          }
          
        elsif definition.name == "D5RenderLight.Strip" || definition.name.start_with?("D5RenderLight.Strip#")
          # Linear light
          puts "  -> Processing Strip light (#{instance.parent.class})"
          
          # Get definition bounds for correct dimensions
          def_bounds = definition.bounds
          
          # Calculate start and end points in definition coordinates
          width = def_bounds.width
          height = def_bounds.height
          depth = def_bounds.depth
          
          # Find the longest dimension
          if width >= height && width >= depth
            # Light extends along X axis
            start_point = Geom::Point3d.new(def_bounds.min.x, def_bounds.center.y, def_bounds.center.z)
            end_point = Geom::Point3d.new(def_bounds.max.x, def_bounds.center.y, def_bounds.center.z)
          elsif height >= width && height >= depth
            # Light extends along Y axis
            start_point = Geom::Point3d.new(def_bounds.center.x, def_bounds.min.y, def_bounds.center.z)
            end_point = Geom::Point3d.new(def_bounds.center.x, def_bounds.max.y, def_bounds.center.z)
          else
            # Light extends along Z axis
            start_point = Geom::Point3d.new(def_bounds.center.x, def_bounds.center.y, def_bounds.min.z)
            end_point = Geom::Point3d.new(def_bounds.center.x, def_bounds.center.y, def_bounds.max.z)
          end
          
          # Transform to global coordinates using accumulated transformation
          global_start = global_trans * start_point
          global_end = global_trans * end_point
          
          puts "    Global transformation applied"
          puts "    Definition start: (#{start_point.x.to_mm.round(2)}, #{start_point.y.to_mm.round(2)}, #{start_point.z.to_mm.round(2)}) mm"
          puts "    Global start: (#{global_start.x.to_mm.round(2)}, #{global_start.y.to_mm.round(2)}, #{global_start.z.to_mm.round(2)}) mm"
          
          linear_lights << {
            type: "linear",
            x1: global_start.x.to_mm,
            y1: global_start.y.to_mm,
            z1: global_start.z.to_mm,
            x2: global_end.x.to_mm,
            y2: global_end.y.to_mm,
            z2: global_end.z.to_mm,
            name: instance.name.empty? ? "LinearLight_#{linear_lights.length + 1}" : instance.name
          }
          
        elsif definition.name.downcase.include?("sw")
          # Switch component
          puts "  -> Processing Switch (#{instance.parent.class})"
          
          # Use origin (insertion point) for switches
          global_origin = global_trans.origin
          
          puts "    Global transformation applied"
          puts "    Global origin: (#{global_origin.x.to_mm.round(2)}, #{global_origin.y.to_mm.round(2)}, #{global_origin.z.to_mm.round(2)}) mm"
          
          # 스위치는 1/2 적용하지 않음 (점조명과 다름)
          switches << {
            type: "switch",
            x: global_origin.x.to_mm,
            y: global_origin.y.to_mm,
            z: global_origin.z.to_mm,
            name: instance.name.empty? ? "Switch_#{switches.length + 1}" : instance.name
          }
        end
      end
      
      puts "\nTotal found: #{point_lights.length} point lights, #{linear_lights.length} linear lights, #{switches.length} switches"
      
      # 디버깅용: 처음 2개 점조명의 좌표 출력
      if point_lights.length >= 2
        puts "\n=== DEBUG: First 2 Point Lights ==="
        point_lights[0..1].each_with_index do |light, index|
          puts "Light #{index + 1}: (#{light[:x].round(2)}, #{light[:y].round(2)}, #{light[:z].round(2)}) mm"
        end
      end
      
      # Check if no components found
      if point_lights.empty? && linear_lights.empty? && switches.empty?
        UI.messagebox("모델링 내 조명/스위치가 없습니다.\n\nD5RenderLight.Spot, D5RenderLight.Strip 또는 SW 컴포넌트를 찾을 수 없습니다.")
        return
      end
      
      # Use tool to get reference points
      tool = ReferencePointCollectorTool.new(point_lights, linear_lights, switches)
      model.tools.push_tool(tool)
    end
    
    # Tool class to collect both reference points
    class ReferencePointCollectorTool
      def initialize(point_lights, linear_lights, switches)
        @point_lights = point_lights
        @linear_lights = linear_lights
        @switches = switches
        @ref_point1 = nil
        @ref_point2 = nil
        @ip = Sketchup::InputPoint.new
        @current_prompt = "Select first reference point"
      end
      
      def activate
        update_status
      end
      
      def onMouseMove(flags, x, y, view)
        @ip.pick(view, x, y)
        view.invalidate
      end
      
      def onLButtonDown(flags, x, y, view)
        if @ref_point1.nil?
          @ref_point1 = @ip.position
          @current_prompt = "Select second reference point"
          update_status
        elsif @ref_point2.nil?
          @ref_point2 = @ip.position
          
          # Pop tool first
          Sketchup.active_model.tools.pop_tool
          
          # Delay export to avoid crash
          UI.start_timer(0.1, false) {
            Iiiaha::CircuiteeExporter::LightExporter.export_to_csv(@point_lights, @linear_lights, @switches, @ref_point1, @ref_point2)
          }
        end
        view.invalidate
      end
      
      def draw(view)
        if @ip.valid?
          @ip.draw(view)
          view.drawing_color = "red"
          view.draw_points(@ip.position, 10, 2, "red")
        end
        
        # Draw first reference point if set
        if @ref_point1
          view.drawing_color = "green"
          view.draw_points(@ref_point1, 10, 2, "green")
          view.draw_text(@ref_point1, "REF 1")
        end
      end
      
      def update_status
        Sketchup.status_text = @current_prompt
      end
      
      def deactivate(view)
        view.invalidate
      end
      
      def onCancel(reason, view)
        Sketchup.active_model.tools.pop_tool
        view.invalidate
      end
      
      def resume(view)
        view.invalidate
      end
    end
    
    def self.export_to_csv(point_lights, linear_lights, switches, ref1, ref2)
      # Get SketchUp model filename (without extension)
      model = Sketchup.active_model
      model_name = model.title.empty? ? "untitled" : model.title.gsub(/[^a-zA-Z0-9_\-]/, '_')
      
      # Get save location - default to desktop
      default_path = ENV['USERPROFILE'] ? "#{ENV['USERPROFILE']}\\Desktop\\" : "C:\\Users\\#{ENV['USERNAME']}\\Desktop\\"
      default_filename = "#{model_name}_circuitee_lights.csv"
      filename = UI.savepanel("Save Lights CSV", default_path, default_filename)
      return unless filename
      
      # Ensure .csv extension
      filename += ".csv" unless filename.end_with?(".csv")
      
      begin
        File.open(filename, 'w') do |file|
          # Write header
          file.puts "Type,X1,Y1,Z1,X2,Y2,Z2,Name"
          
          # Write reference points
          file.puts "reference1,#{ref1.x.to_mm},#{ref1.y.to_mm},#{ref1.z.to_mm},,,,REF1"
          file.puts "reference2,#{ref2.x.to_mm},#{ref2.y.to_mm},#{ref2.z.to_mm},,,,REF2"
          
          # Write point lights
          point_lights.each do |light|
            file.puts "point,#{light[:x]},#{light[:y]},#{light[:z]},,,,#{light[:name]}"
          end
          
          # Write linear lights
          linear_lights.each do |light|
            file.puts "linear,#{light[:x1]},#{light[:y1]},#{light[:z1]},#{light[:x2]},#{light[:y2]},#{light[:z2]},#{light[:name]}"
          end
          
          # Write switches
          switches.each do |switch|
            file.puts "switch,#{switch[:x]},#{switch[:y]},#{switch[:z]},,,,#{switch[:name]}"
          end
        end
        
        UI.messagebox("조명 좌표 데이터를 내보냈습니다.\nCIRCUITEE에서 불러오세요.\n\n내보낸 요소:\n- 점조명: #{point_lights.length}개\n- 라인조명: #{linear_lights.length}개\n- 스위치: #{switches.length}개\n\n파일 위치:\n#{filename}")
      rescue => e
        UI.messagebox("Error exporting CSV: #{e.message}")
      end
    end
    
    # Debug function to list all definitions
    def self.list_all_definitions
      model = Sketchup.active_model
      puts "\n=== All Component Definitions ==="
      model.definitions.each_with_index do |definition, index|
        if definition.instances.length > 0
          puts "#{index}: '#{definition.name}' (#{definition.instances.length} instances)"
        end
      end
    end
    
    end
  end
end